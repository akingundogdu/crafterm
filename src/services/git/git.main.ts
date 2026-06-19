import { handle, Channel } from '@services/channels.main'
import * as terminal from '@core/services/terminal.manager'
import * as git from '@core/services/git.service'
import { paneCwd } from '@core/services/exec'

// Git bridge (git:*): branch/stash pickers + Files-tree decorations + worktree
// list. Parsing lives in services/git.service.ts; pane-scoped calls resolve the
// pane's cwd (pid → lsof) before delegating.
export function registerGitIpc(): void {
  // Local branches for the repo a pane is in, most-recently-committed first.
  handle(Channel.Git.Branches, async ({ id }) => {
    const p = terminal.get(id)
    if (!p) return []
    const cwd = await paneCwd(p.pid)
    if (!cwd) return []
    return git.branches(cwd)
  })

  // List git stashes for the repo a pane is in: [{ ref: 'stash@{0}', description }].
  handle(Channel.Git.StashList, async ({ id }) => {
    const p = terminal.get(id)
    if (!p) return []
    const cwd = await paneCwd(p.pid)
    if (!cwd) return []
    return git.stashList(cwd)
  })

  // Git working-tree status for the Files tree decorations: map of absolute path →
  // change kind, parsed from `git status --porcelain`.
  handle(Channel.Git.FileStatus, ({ cwd }) => git.fileStatus(cwd))

  // List git worktrees for the repo containing `cwd`.
  handle(Channel.Git.Worktrees, ({ cwd }) => git.listWorktrees(cwd))

  // Create a worktree at `path` for `branch`, awaiting completion (unlike the
  // terminal-based newWorktree). Fetches the base from origin first so the new
  // branch starts off the latest remote tip, then tries `-b` (new branch off
  // origin/base) and finally falls back to attaching an existing branch. Used by
  // "Run in worktree" (todo6).
  handle(Channel.Git.WorktreeAdd, ({ repo, path, branch, base }) =>
    git.worktreeAdd(repo, path, branch, base)
  )
}
