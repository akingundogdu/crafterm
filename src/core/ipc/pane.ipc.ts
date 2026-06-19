import { ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import * as terminal from '../services/terminal.manager'
import * as git from '../services/git.service'
import { paneCwd } from '../services/exec'
import { lastCmdDir } from '../services/paths'

// A ZDOTDIR shim records each command run in a pane to
// <stateDir>/last-cmd/<CRAFTERM_PANE_ID>. On restore the renderer pre-types it
// for raw (non-Claude) panes so the user can resume where they left off.
function readLastCommand(stableId: string): string | null {
  try {
    const f = join(lastCmdDir(), stableId)
    if (!existsSync(f)) return null
    const s = readFileSync(f, 'utf8').trim()
    // Drop multi-line commands: pre-typing one with embedded newlines would auto-
    // run every line but the last, defeating the type-but-don't-run safety intent.
    if (!s || s.includes('\n')) return null
    return s
  } catch {
    return null
  }
}

// Pane info bridge (pane:*): a pane's cwd (pid → lsof), git branch/worktree, and
// the last command it ran.
export function registerPaneIpc(): void {
  ipcMain.handle('pane:info', async (_e, { id, stableId }: { id: string; stableId?: string }) => {
    const lastCommand = stableId ? readLastCommand(stableId) : null
    const p = terminal.get(id)
    if (!p) return { cwd: null, branch: null, worktree: null, lastCommand }
    const cwd = await paneCwd(p.pid)
    const [branch, worktree] = cwd
      ? await Promise.all([git.currentBranch(cwd), git.worktreeName(cwd)])
      : [null, null]
    return { cwd, branch, worktree, lastCommand }
  })
}
