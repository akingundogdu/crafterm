import { call } from './_forward'

// Git IPC (branches, stashes, working-tree status, worktrees).
export const gitService = {
  branches: call('gitBranches'),
  stashList: call('gitStashList'),
  fileStatus: call('gitFileStatus'),
  listWorktrees: call('listWorktrees'),
  worktreeAdd: call('worktreeAdd')
}
