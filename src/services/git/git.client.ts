import { call } from '../channels.client'

// Git IPC (branches, stashes, working-tree status, worktrees).
export const gitService = {
  branches: (id: string) => call('git:branches', { id }),
  stashList: (id: string) => call('git:stashList', { id }),
  fileStatus: (cwd: string) => call('git:fileStatus', { cwd }),
  listWorktrees: (cwd?: string) => call('git:worktrees', { cwd }),
  worktreeAdd: (repo: string, path: string, branch: string, base?: string) =>
    call('git:worktreeAdd', { repo, path, branch, base })
}
