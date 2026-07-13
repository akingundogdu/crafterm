import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// PR + GitHub Actions/deployments IPC (gh CLI). Arrow-function fields so call
// sites can destructure/pass the methods freely.
class PrClient extends BaseClient {
  available = (cwd: string) => this.call(Channel.Pr.Available, { cwd })
  list = (cwd: string) => this.call(Channel.Pr.List, { cwd })
  repos = (root: string) => this.call(Channel.Pr.Repos, { root })
  listAll = (root: string, paths: string[]) => this.call(Channel.Pr.ListAll, { root, paths })
  merge = (cwd: string, number: number, method: string) =>
    this.call(Channel.Pr.Merge, { cwd, number, method })
  view = (cwd: string, number: number) => this.call(Channel.Pr.View, { cwd, number })
  diff = (cwd: string, number: number) => this.call(Channel.Pr.Diff, { cwd, number })
  comment = (
    cwd: string,
    number: number,
    path: string,
    startLine: number,
    endLine: number,
    body: string
  ) => this.call(Channel.Pr.Comment, { cwd, number, path, startLine, endLine, body })
  runs = (cwd: string) => this.call(Channel.Gh.Runs, { cwd })
  runJobs = (cwd: string, id: number) => this.call(Channel.Gh.RunJobs, { cwd, id })
  deployments = (cwd: string) => this.call(Channel.Gh.Deployments, { cwd })
  deploysAll = (root: string, paths: string[]) => this.call(Channel.Gh.DeploysAll, { root, paths })
}

export const prService = new PrClient()
