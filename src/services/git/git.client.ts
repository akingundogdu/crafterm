import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// Git IPC (branches, stashes, working-tree status, worktrees). Arrow-function
// fields so call sites can destructure/pass the methods freely.
class GitClient extends BaseClient {
  branches = (id: string) => this.call(Channel.Git.Branches, { id })
  branchesAt = (cwd: string) => this.call(Channel.Git.BranchesAt, { cwd })
  stashList = (id: string) => this.call(Channel.Git.StashList, { id })
  fileStatus = (cwd: string) => this.call(Channel.Git.FileStatus, { cwd })
  listWorktrees = (cwd?: string) => this.call(Channel.Git.Worktrees, { cwd })
  worktreeAdd = (repo: string, path: string, branch: string, base?: string) =>
    this.call(Channel.Git.WorktreeAdd, { repo, path, branch, base })
}

export const gitService = new GitClient()
