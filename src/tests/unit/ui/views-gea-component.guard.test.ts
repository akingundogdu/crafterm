import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// HARD RULE (§views): under src/views, apart from the build-infra shims, NO plain-
// DOM view code — no `el(...)` / `createElement` container factories in a `.ts`.
// Every folder's view is a gea `.tsx` Component; imperative widgets (Monaco,
// xterm, <webview>, datepicker) get a thin gea `.tsx` shell that mounts them via a
// property `ref` + `onAfterRender` (§5.11). This keeps the renderer uniformly gea.
//
// This guard is a RATCHET: a folder is a violation while ANY non-infra `.ts` in it
// still uses `el(` / `createElement` (having a `.tsx` in the folder does NOT
// exempt it — every plain-DOM view must go). The frozen set of CURRENT violations
// is GRANDFATHERED. The guard fails if that set changes either way — a NEW
// violator appears, or a folder was cleaned but not removed from the list. The
// migration is done when GRANDFATHERED is empty (then drop the `lib` INFRA entry +
// delete `lib/dom.ts`).
const VIEWS = join(process.cwd(), 'src', 'views')
// Plain-DOM VIEW building only (the `el()` helper + raw createElement). Note:
// `appendChild` / `innerHTML=` are NOT flagged — they legitimately appear inside
// gea `onAfterRender` when mounting an imperative widget into a host div.
const DOM_PATTERN = /\bel\(|\bcreateElement\b/

// Build-infra shims allowed to build DOM imperatively:
//  - '.'   → jsx-runtime.ts / jsx-dev-runtime.ts (the JSX runtime itself)
//  - 'lib' → dom.ts (the `el()` helper; deleted once every folder is converted)
const INFRA = new Set(['.', 'lib'])

// Folders still containing plain-DOM (`el()`/`createElement`) `.ts` view code.
// SHRINK this as batches convert to gea; when empty, drop it + the INFRA `lib`
// entry + delete `lib/dom.ts`.
const GRANDFATHERED = [
  'commands',
  'components/datepicker/components',
  'components/dialog',
  'components/overlay',
  'components/status-bar/components',
  'components/treeview/components',
  'editor/code-editor/components',
  'notebook',
  'pane',
  'pane/components',
  'screens/code-pane',
  'screens/code-pane/components',
  'screens/content',
  'screens/content/components',
  'screens/database',
  'screens/db-pane',
  'screens/db-pane/components',
  'screens/diff',
  'screens/diff-pane',
  'screens/diff-pane/components',
  'screens/diff/components',
  'screens/explorer',
  'screens/file-pane',
  'screens/file-pane/components',
  'screens/pickers/components',
  'screens/pickers/lib',
  'screens/settings',
  'screens/settings/components',
  'screens/settings/lib',
  'screens/settings/tabs',
  'screens/settings/tabs/components',
  'screens/sidebar/components',
  'screens/spotlight',
  'screens/spotlight/components',
  'terminal',
  'terminal/components'
].sort()

function rel(dir: string): string {
  const r = dir.slice(VIEWS.length).replace(/^[/\\]/, '').split('\\').join('/')
  return r === '' ? '.' : r
}

function collectViolators(dir: string, acc: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const e of entries) if (e.isDirectory()) collectViolators(join(dir, e.name), acc)

  if (INFRA.has(rel(dir))) return
  const files = entries.filter((e) => e.isFile()).map((e) => e.name)
  const buildsDom = files.some(
    (f) => f.endsWith('.ts') && !f.endsWith('.d.ts') && DOM_PATTERN.test(readFileSync(join(dir, f), 'utf8'))
  )
  if (buildsDom) acc.push(rel(dir))
}

describe('views gea-Component guard', () => {
  it('no plain-DOM el()/createElement view code under src/views (ratchet)', () => {
    const violators: string[] = []
    collectViolators(VIEWS, violators)
    violators.sort()

    const newOnes = violators.filter((v) => !GRANDFATHERED.includes(v))
    const cleaned = GRANDFATHERED.filter((v) => !violators.includes(v))

    expect(
      newOnes,
      `NEW plain-DOM el()/createElement view(s) under src/views — make it a gea .tsx Component: ${newOnes.join(', ')}`
    ).toEqual([])
    expect(
      cleaned,
      `folder(s) cleaned of plain-DOM but still listed in GRANDFATHERED — remove them: ${cleaned.join(', ')}`
    ).toEqual([])
  })
})
