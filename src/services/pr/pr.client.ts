import { call, Channel } from '../channels.client'

// PR + GitHub Actions/deployments IPC (gh CLI).
export const prService = {
  available: (cwd: string) => call(Channel.Pr.Available, { cwd }),
  list: (cwd: string) => call(Channel.Pr.List, { cwd }),
  repos: (root: string) => call(Channel.Pr.Repos, { root }),
  listAll: (root: string, paths: string[]) => call(Channel.Pr.ListAll, { root, paths }),
  merge: (cwd: string, number: number, method: string) =>
    call(Channel.Pr.Merge, { cwd, number, method }),
  view: (cwd: string, number: number) => call(Channel.Pr.View, { cwd, number }),
  diff: (cwd: string, number: number) => call(Channel.Pr.Diff, { cwd, number }),
  comment: (
    cwd: string,
    number: number,
    path: string,
    startLine: number,
    endLine: number,
    body: string
  ) => call(Channel.Pr.Comment, { cwd, number, path, startLine, endLine, body }),
  runs: (cwd: string) => call(Channel.Gh.Runs, { cwd }),
  runJobs: (cwd: string, id: number) => call(Channel.Gh.RunJobs, { cwd, id }),
  deployments: (cwd: string) => call(Channel.Gh.Deployments, { cwd }),
  deploysAll: (root: string, paths: string[]) => call(Channel.Gh.DeploysAll, { root, paths })
}
