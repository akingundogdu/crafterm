import { call } from './_forward'

// Plans IPC (~/.claude/plans + project docs/plans scan + live watch).
export const plansService = {
  list: call('listPlans'),
  forBranch: call('plansForBranch'),
  scan: call('scanPlans'),
  onChanged: call('onPlansChanged')
}
