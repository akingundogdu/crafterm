import { call } from '../_forward'

// Plans IPC (~/.claude/plans + project docs/plans scan + live watch).
export const plansService = {
  list: call('plans', 'list'),
  forBranch: call('plans', 'forBranch'),
  scan: call('plans', 'scan'),
  onChanged: call('plans', 'onChanged')
}
