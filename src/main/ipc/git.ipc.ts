import { ipcMain } from 'electron'
import * as terminal from '../services/terminal.manager'
import * as git from '../services/git.service'
import { paneCwd } from '../services/exec'

// Git bridge (git:*): branch/stash pickers + Files-tree decorations + worktree
// list. Parsing lives in services/git.service.ts; pane-scoped calls resolve the
// pane's cwd (pid → lsof) before delegating.
export function registerGitIpc(): void {
  // Local branches for the repo a pane is in, most-recently-committed first.
  ipcMain.handle('git:branches', async (_e, { id }: { id: string }) => {
    const p = terminal.get(id)
    if (!p) return []
    const cwd = await paneCwd(p.pid)
    if (!cwd) return []
    return git.branches(cwd)
  })

  // List git stashes for the repo a pane is in: [{ ref: 'stash@{0}', description }].
  ipcMain.handle('git:stashList', async (_e, { id }: { id: string }) => {
    const p = terminal.get(id)
    if (!p) return []
    const cwd = await paneCwd(p.pid)
    if (!cwd) return []
    return git.stashList(cwd)
  })

  // Git working-tree status for the Files tree decorations: map of absolute path →
  // change kind, parsed from `git status --porcelain`.
  ipcMain.handle('git:fileStatus', (_e, { cwd }: { cwd?: string }) => git.fileStatus(cwd))

  // List git worktrees for the repo containing `cwd`.
  ipcMain.handle('git:worktrees', (_e, { cwd }: { cwd?: string }) => git.listWorktrees(cwd))

  // Create a worktree at `path` for `branch`, awaiting completion (unlike the
  // terminal-based newWorktree). Fetches the base from origin first so the new
  // branch starts off the latest remote tip, then tries `-b` (new branch off
  // origin/base) and finally falls back to attaching an existing branch. Used by
  // "Run in worktree" (todo6).
  ipcMain.handle(
    'git:worktreeAdd',
    (
      _e,
      { repo, path, branch, base }: { repo: string; path: string; branch: string; base?: string }
    ) => git.worktreeAdd(repo, path, branch, base)
  )
}
