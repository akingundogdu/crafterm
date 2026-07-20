import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import * as terminal from '@core/services/terminal.manager/terminal.manager.service'
import * as git from '@core/services/git/git.service'
import { paneCwd } from '@core/services/exec/exec.service'

// Git IPC adapter (git:*): branch/stash pickers + Files-tree decorations +
// worktree list. Parsing lives in @core/services/git; pane-scoped calls resolve
// the pane's cwd (pid → lsof) before delegating. Thin — no extra service layer.
export class GitController extends BaseService {
  readonly name = 'git'

  register(): void {
    // Local branches for the repo a pane is in, most-recently-committed first.
    this.handle(Channel.Git.Branches, async ({ id }) => {
      const p = terminal.get(id)
      if (!p) return []
      const cwd = await paneCwd(p.pid)
      if (!cwd) return []
      return git.branches(cwd)
    })

    // Local branches for a repo path — for callers with no pane to resolve a cwd
    // from (the content empty state's composer picks a base branch before any
    // terminal exists).
    this.handle(Channel.Git.BranchesAt, async ({ cwd }) => {
      if (!cwd) return []
      return git.branches(cwd)
    })

    // What a worktree would lose if it were removed now (todomrkkvspyax).
    this.handle(Channel.Git.WorktreeState, ({ cwd }) => git.worktreeState(cwd))

    // List git stashes for the repo a pane is in: [{ ref: 'stash@{0}', description }].
    this.handle(Channel.Git.StashList, async ({ id }) => {
      const p = terminal.get(id)
      if (!p) return []
      const cwd = await paneCwd(p.pid)
      if (!cwd) return []
      return git.stashList(cwd)
    })

    // Git working-tree status for the Files tree decorations: map of absolute path →
    // change kind, parsed from `git status --porcelain`.
    this.handle(Channel.Git.FileStatus, ({ cwd }) => git.fileStatus(cwd))

    // List git worktrees for the repo containing `cwd`.
    this.handle(Channel.Git.Worktrees, ({ cwd }) => git.listWorktrees(cwd))

    // Create a worktree at `path` for `branch`, awaiting completion (unlike the
    // terminal-based newWorktree). Fetches the base from origin first so the new
    // branch starts off the latest remote tip, then tries `-b` (new branch off
    // origin/base) and finally falls back to attaching an existing branch.
    this.handle(Channel.Git.WorktreeAdd, ({ repo, path, branch, base }) =>
      git.worktreeAdd(repo, path, branch, base)
    )
  }
}

// Transitional shim so core/index.ts keeps compiling until the bootstrap is
