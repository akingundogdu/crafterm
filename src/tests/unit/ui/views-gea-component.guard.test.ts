import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// HARD RULE (§views): under src/views, apart from the build-infra shims, every
// folder that builds DOM MUST express its view as a gea `.tsx` Component. No
// plain-DOM `el(...)` / `createElement` container factories in a `.ts` view. This
// keeps the renderer uniformly gea instead of drifting into ad-hoc structures.
//
// This guard is a RATCHET: a folder that builds DOM (matches DOM_PATTERN in a
// `.ts` file) but has no `.tsx` is a violation. The set of CURRENT violations is
// frozen in GRANDFATHERED below. The guard fails if that set changes in EITHER
// direction — a NEW violator appears (add nothing; fix it), or a listed folder
// was converted to gea (remove it from the list). The migration to full gea is
// done when GRANDFATHERED is empty.
const VIEWS = join(process.cwd(), 'src', 'views')
const DOM_PATTERN = /\bel\(|createElement|\.appendChild\(|innerHTML\s*=/

// Build-infra shims that are allowed to touch the DOM imperatively:
//  - '.'   → jsx-runtime.ts / jsx-dev-runtime.ts (the JSX runtime itself)
//  - 'lib' → dom.ts (the `el()` helper; removed once every folder is converted)
const INFRA = new Set(['.', 'lib'])

// Folders still building DOM in plain `.ts` (no `.tsx`). SHRINK this as batches
// convert to gea Components; when empty, drop it + the INFRA `lib` entry.
const GRANDFATHERED = [
  'commands',
  'components/context-menu',
  'components/context-menu/components',
  'components/datepicker/components',
  'components/dialog',
  'components/overlay',
  'components/status-bar/components',
  'components/treeview/components',
  'editor/code-editor/components',
  'notebook',
  'notebook/components',
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
  'screens/explorer/components',
  'screens/file-pane',
  'screens/file-pane/components',
  'screens/ios-worktree/components',
  'screens/pickers/claude',
  'screens/pickers/claude/components',
  'screens/pickers/command',
  'screens/pickers/command/components',
  'screens/pickers/components',
  'screens/pickers/finders',
  'screens/pickers/finders/components',
  'screens/pickers/folder',
  'screens/pickers/folder/components',
  'screens/pickers/git',
  'screens/pickers/git/components',
  'screens/pickers/global-search',
  'screens/pickers/global-search/components',
  'screens/pickers/lib',
  'screens/pickers/plans',
  'screens/pickers/plans/components',
  'screens/pickers/processes',
  'screens/pickers/processes/components',
  'screens/pickers/project',
  'screens/pickers/project/components',
  'screens/pickers/ssh',
  'screens/pickers/ssh/components',
  'screens/pickers/update',
  'screens/pickers/update/components',
  'screens/pickers/worktree',
  'screens/pickers/worktree/components',
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
  if (files.some((f) => f.endsWith('.tsx'))) return
  const buildsDom = files.some(
    (f) => f.endsWith('.ts') && !f.endsWith('.d.ts') && DOM_PATTERN.test(readFileSync(join(dir, f), 'utf8'))
  )
  if (buildsDom) acc.push(rel(dir))
}

describe('views gea-Component guard', () => {
  it('every DOM-building folder under src/views is a gea .tsx Component (ratchet)', () => {
    const violators: string[] = []
    collectViolators(VIEWS, violators)
    violators.sort()

    const newOnes = violators.filter((v) => !GRANDFATHERED.includes(v))
    const converted = GRANDFATHERED.filter((v) => !violators.includes(v))

    expect(
      newOnes,
      `NEW plain-DOM .ts view(s) under src/views (must be a gea .tsx Component): ${newOnes.join(', ')}`
    ).toEqual([])
    expect(
      converted,
      `converted folder(s) still listed in GRANDFATHERED — remove them: ${converted.join(', ')}`
    ).toEqual([])
  })
})
