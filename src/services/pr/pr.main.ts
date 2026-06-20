import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { PrService } from './pr.service'

// PR + GitHub Actions/deployments IPC adapter (pr:* / gh:*). Thin: maps each
// channel to a PrService method; all gh orchestration lives in pr.service.ts.
export class PrController extends BaseService {
  readonly name = 'pr'
  private readonly service = new PrService()

  register(): void {
    this.handle(Channel.Pr.Available, ({ cwd }) => this.service.available(cwd))
    this.handle(Channel.Pr.List, ({ cwd }) => this.service.list(cwd))
    this.handle(Channel.Pr.Repos, ({ root }) => this.service.repos(root))
    this.handle(Channel.Pr.ListAll, ({ root, paths }) => this.service.listAll(root, paths))
    this.handle(Channel.Pr.Merge, ({ cwd, number, method }) => this.service.merge(cwd, number, method))
    this.handle(Channel.Pr.View, ({ cwd, number }) => this.service.view(cwd, number))
    this.handle(Channel.Pr.Diff, ({ cwd, number }) => this.service.diff(cwd, number))
    this.handle(Channel.Pr.Comment, ({ cwd, number, path, startLine, endLine, body }) =>
      this.service.comment(cwd, number, path, startLine, endLine, body)
    )
    this.handle(Channel.Gh.Runs, ({ cwd }) => this.service.runs(cwd))
    this.handle(Channel.Gh.RunJobs, ({ cwd, id }) => this.service.runJobs(cwd, id))
    this.handle(Channel.Gh.Deployments, ({ cwd }) => this.service.deployments(cwd))
    this.handle(Channel.Gh.DeploysAll, ({ root, paths }) => this.service.deploysAll(root, paths))
  }
}

// Transitional shim so core/index.ts keeps compiling until the bootstrap is
