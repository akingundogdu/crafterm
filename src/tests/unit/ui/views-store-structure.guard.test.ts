import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

// HARD RULE (§views component structure): under src/views a component is
// `<name>.tsx` (view) + `<name>.store.ts` (all non-view code: reactive Store +
// pure logic + constants + IPC) + `<name>.css` (+ optional `<name>.types.ts`).
// The old `types/state/view` split and the imperative `.controller` manager are
// RETIRED: no NEW `<name>.state.ts` and no NEW `<name>.controller.*` may be added.
//
// Two RATCHETS:
//  1. `.state.ts` — every current one is GRANDFATHERED; the guard fails if a NEW
//     `.state.ts` appears OR a grandfathered one is folded into its `.store.ts` but
//     not removed from the list. The migration is done when GRANDFATHERED is empty.
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

// Current `.state.ts` files, frozen. SHRINK this as each folds into its sibling
// `.store.ts`; when empty, the migration is done and `.state.ts` is fully retired.
const GRANDFATHERED_STATE = [
  'commands/commands.state.ts',
  'components/context-menu/context-menu.state.ts',
  'components/datepicker/datepicker.state.ts',
  'components/status-bar/status-bar.state.ts',
  'components/treeview/treeview.state.ts',
  'editor/code-editor/code-editor.state.ts',
  'editor/sql-editor/sql-editor.state.ts',
  'improveWindow/improveWindow.state.ts',
  'main/main.state.ts',
  'notebook/notebook.state.ts',
  'pane/pane.state.ts',
  'popout/popout.state.ts',
  'screens/accounts/components/account-form.state.ts',
  'screens/code-pane/code-pane.state.ts',
  'screens/content/content.state.ts',
  'screens/daily-plan/daily-plan.state.ts',
  'screens/database/database.state.ts',
  'screens/db-pane/components/result-grid.state.ts',
  'screens/db-pane/db-pane.state.ts',
  'screens/diff-pane/components/comment-popover.state.ts',
  'screens/diff-pane/components/file-search.state.ts',
  'screens/diff-pane/diff-pane.state.ts',
  'screens/diff/line-select.state.ts',
  'screens/docker/components/detail-modal.state.ts',
  'screens/explorer/explorer.state.ts',
  'screens/file-pane/file-pane.state.ts',
  'screens/improve-crafterm/improve-crafterm.state.ts',
  'screens/ios-worktree/ios-worktree.state.ts',
  'screens/meeting-notes/meeting-notes.state.ts',
  'screens/notifications/notifications.state.ts',
  'screens/pickers/claude/claude.state.ts',
  'screens/pickers/command/command.state.ts',
  'screens/pickers/finders/finders.state.ts',
  'screens/pickers/folder/folder.state.ts',
  'screens/pickers/git/git.state.ts',
  'screens/pickers/global-search/global-search.state.ts',
  'screens/pickers/plans/plans.state.ts',
  'screens/pickers/processes/processes.state.ts',
  'screens/pickers/project/project.state.ts',
  'screens/pickers/shared.state.ts',
  'screens/pickers/ssh/ssh.state.ts',
  'screens/pickers/update/update.state.ts',
  'screens/pickers/worktree/worktree.state.ts',
  'screens/pr/cards.state.ts',
  'screens/pr/components/project-picker.state.ts',
  'screens/pr/pr.state.ts',
  'screens/settings/settings.state.ts',
  'screens/settings/shared.state.ts',
  'screens/settings/tabs/action-menu.state.ts',
  'screens/settings/tabs/appearance.state.ts',
  'screens/settings/tabs/commands.state.ts',
  'screens/settings/tabs/components/project-tree.state.ts',
  'screens/settings/tabs/projects.state.ts',
  'screens/settings/tabs/reminders.state.ts',
  'screens/settings/tabs/shortcuts.state.ts',
  'screens/settings/tabs/sidebar-tab.state.ts',
  'screens/settings/tabs/system-update.state.ts',
  'screens/settings/tabs/tabs.state.ts',
  'screens/settings/tabs/workspace.state.ts',
  'screens/sidebar/sidebar.state.ts',
  'screens/spotlight/components/spot-tabs.state.ts',
  'screens/spotlight/spotlight.state.ts',
  'screens/time/components/time-report.state.ts',
  'screens/time/time.state.ts',
  'terminal/status-bar.state.ts',
  'terminal/terminal.state.ts'
].sort()

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
