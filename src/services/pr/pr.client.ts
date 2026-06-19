import { call } from '../_forward'

// PR + GitHub Actions/deployments IPC (gh CLI).
export const prService = {
  available: call('pr', 'available'),
  list: call('pr', 'list'),
  repos: call('pr', 'repos'),
  listAll: call('pr', 'listAll'),
  merge: call('pr', 'merge'),
  view: call('pr', 'view'),
  diff: call('pr', 'diff'),
  comment: call('pr', 'comment'),
  runs: call('pr', 'runs'),
  runJobs: call('pr', 'runJobs'),
  deployments: call('pr', 'deployments'),
  deploysAll: call('pr', 'deploysAll')
}
