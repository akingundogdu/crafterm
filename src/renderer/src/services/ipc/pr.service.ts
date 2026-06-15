import { call } from './_forward'

// PR + GitHub Actions/deployments IPC (gh CLI).
export const prService = {
  available: call('prAvailable'),
  list: call('prList'),
  repos: call('prRepos'),
  listAll: call('prListAll'),
  merge: call('prMerge'),
  view: call('prView'),
  diff: call('prDiff'),
  comment: call('prComment'),
  runs: call('ghRuns'),
  runJobs: call('ghRunJobs'),
  deployments: call('ghDeployments'),
  deploysAll: call('ghDeploysAll')
}
