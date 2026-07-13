import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import * as terminal from '@core/services/terminal.manager/terminal.manager.service'
import * as git from '@core/services/git/git.service'
import { paneCwd } from '@core/services/exec/exec.service'
import { lastCmdDir } from '@core/services/paths/paths.service'
import type { PaneInfo } from './pane.types'

// Pane info domain logic (pane:*): a pane's cwd (pid → lsof), git branch/worktree,
// and the last command it ran. No IPC wiring (that's the PaneController adapter).
export class PaneService {
  // A ZDOTDIR shim records each command run in a pane to
  // <stateDir>/last-cmd/<CRAFTERM_PANE_ID>. On restore the renderer pre-types it
  // for raw (non-Claude) panes so the user can resume where they left off.
  private readLastCommand(stableId: string): string | null {
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

  async info(id: string, stableId?: string): Promise<PaneInfo> {
    const lastCommand = stableId ? this.readLastCommand(stableId) : null
    const p = terminal.get(id)
    if (!p) return { cwd: null, branch: null, worktree: null, lastCommand }
    const cwd = await paneCwd(p.pid)
    const [branch, worktree] = cwd
      ? await Promise.all([git.currentBranch(cwd), git.worktreeName(cwd)])
      : [null, null]
    return { cwd, branch, worktree, lastCommand }
  }
}
