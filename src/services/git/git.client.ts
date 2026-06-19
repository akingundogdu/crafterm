import { call, Channel } from '../channels.client'

// Git IPC (branches, stashes, working-tree status, worktrees).
export const gitService = {
  branches: (id: string) => call(Channel.Git.Branches, { id }),
  stashList: (id: string) => call(Channel.Git.StashList, { id }),
  fileStatus: (cwd: string) => call(Channel.Git.FileStatus, { cwd }),
  listWorktrees: (cwd?: string) => call(Channel.Git.Worktrees, { cwd }),
  worktreeAdd: (repo: string, path: string, branch: string, base?: string) =>
    call(Channel.Git.WorktreeAdd, { repo, path, branch, base })
}
