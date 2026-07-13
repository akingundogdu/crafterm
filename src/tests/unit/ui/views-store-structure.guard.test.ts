import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

// HARD RULE (§views component structure): under src/views a component is
// `<name>.tsx` (view) + `<name>.store.ts` (all non-view code: reactive Store +
// pure logic + constants + IPC) + `<name>.css` (+ optional `<name>.types.ts`).
// The old `types/state/view` split and the imperative `.controller` manager are
// RETIRED: no NEW `<name>.state.ts` and no NEW `<name>.controller.*` may be added.
//
// Enforcement:
//  1. `.state.ts` — FULLY RETIRED. The migration is complete (all 66 folded into
//     their `.store.ts` / plain `.ts`), so GRANDFATHERED_STATE is empty and ANY
//     `.state.ts` under src/views now fails the guard.
//  2. `.controller.*` — only the 6 ALLOWED imperative-widget controllers may exist
//     (Monaco/xterm/diff-engine/DOM-reconciliation the async store model can't
//     express). Any other `.controller` file fails the guard.
const VIEWS = join(process.cwd(), 'src', 'views')

// The ONLY `.controller` files permitted — documented imperative-widget exceptions.
// A store-reading gea component renders asynchronously; these own a synchronous-DOM
// widget or a reconciliation loop that cannot be expressed as a reactive store.
const ALLOWED_CONTROLLERS = new Set([
  'components/treeview/treeview.controller.ts',
  'screens/code-pane/code-pane.controller.ts',
  'screens/content/content.controller.ts',
  'screens/db-pane/db-pane.controller.tsx',
  'screens/diff-pane/components/file-search.controller.tsx',
  'screens/diff/line-select.controller.tsx'
])

// EMPTY — the `.state.ts` → `.store.ts` migration is complete. Any `.state.ts`
// under src/views is now a hard failure.
const GRANDFATHERED_STATE: string[] = []

function rel(path: string): string {
  return path.slice(VIEWS.length).replace(/^[/\\]/, '').split('\\').join('/')
}

function collect(dir: string, acc: { state: string[]; controller: string[] }): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) collect(full, acc)
    else if (e.name.endsWith('.state.ts')) acc.state.push(rel(full))
    else if (e.name.endsWith('.controller.ts') || e.name.endsWith('.controller.tsx')) acc.controller.push(rel(full))
  }
}

describe('views store-structure guard', () => {
  it('no NEW .state.ts (folds into .store.ts) and no un-allowed .controller (ratchet)', () => {
    const found = { state: [] as string[], controller: [] as string[] }
    collect(VIEWS, found)
    found.state.sort()

    const newState = found.state.filter((f) => !GRANDFATHERED_STATE.includes(f))
    const cleanedState = GRANDFATHERED_STATE.filter((f) => !found.state.includes(f))
    const badControllers = found.controller.filter((f) => !ALLOWED_CONTROLLERS.has(f))

    expect(
      newState,
      `NEW .state.ts under src/views — fold its non-view code into the sibling .store.ts instead: ${newState.join(', ')}`
    ).toEqual([])
    expect(
      cleanedState,
      `.state.ts folded into .store.ts but still listed in GRANDFATHERED_STATE — remove them: ${cleanedState.join(', ')}`
    ).toEqual([])
    expect(
      badControllers,
      `.controller file not in the 6 documented imperative-widget exceptions — express it as a gea .tsx + .store.ts instead: ${badControllers.join(', ')}`
    ).toEqual([])
  })
})
