import { call } from '../_forward'

// Git IPC (branches, stashes, working-tree status, worktrees).
export const gitService = {
  branches: call('git', 'branches'),
  stashList: call('git', 'stashList'),
  fileStatus: call('git', 'fileStatus'),
  listWorktrees: call('git', 'listWorktrees'),
  worktreeAdd: call('git', 'worktreeAdd')
}
