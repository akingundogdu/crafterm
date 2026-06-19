import { call } from '../channels.client'

// PR + GitHub Actions/deployments IPC (gh CLI).
export const prService = {
  available: (cwd: string) => call('pr:available', { cwd }),
  list: (cwd: string) => call('pr:list', { cwd }),
  repos: (root: string) => call('pr:repos', { root }),
  listAll: (root: string, paths: string[]) => call('pr:list-all', { root, paths }),
  merge: (cwd: string, number: number, method: string) =>
    call('pr:merge', { cwd, number, method }),
  view: (cwd: string, number: number) => call('pr:view', { cwd, number }),
  diff: (cwd: string, number: number) => call('pr:diff', { cwd, number }),
  comment: (
    cwd: string,
    number: number,
    path: string,
    startLine: number,
    endLine: number,
    body: string
  ) => call('pr:comment', { cwd, number, path, startLine, endLine, body }),
  runs: (cwd: string) => call('gh:runs', { cwd }),
  runJobs: (cwd: string, id: number) => call('gh:run-jobs', { cwd, id }),
  deployments: (cwd: string) => call('gh:deployments', { cwd }),
  deploysAll: (root: string, paths: string[]) => call('gh:deploys-all', { root, paths })
}
