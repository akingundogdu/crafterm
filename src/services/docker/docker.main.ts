import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { DockerService } from './docker.service'

// Docker IPC adapter (docker:*). Thin: maps each channel to a DockerService method;
// the arg-vector building + result shaping live in docker.service.ts.
export class DockerController extends BaseService {
  readonly name = 'docker'
  private readonly service = new DockerService()

  register(): void {
    this.handle(Channel.Docker.Available, () => this.service.available())
    this.handle(Channel.Docker.Containers, () => this.service.containers())
    this.handle(Channel.Docker.Images, () => this.service.images())
    this.handle(Channel.Docker.Volumes, () => this.service.volumes())
    this.handle(Channel.Docker.Networks, () => this.service.networks())
    this.handle(Channel.Docker.Compose, () => this.service.compose())
    this.handle(Channel.Docker.Stats, () => this.service.stats())
    this.handle(Channel.Docker.Inspect, ({ kind, id }) => this.service.inspect(kind, id))
    this.handle(Channel.Docker.Logs, ({ id, tail }) => this.service.logs(id, tail))
    this.handle(Channel.Docker.Action, ({ kind, action, id, configFile }) =>
      this.service.action(kind, action, id, configFile)
    )
    this.handle(Channel.Docker.Prune, ({ target }) => this.service.prune(target))
  }
}

// Transitional shim: keeps the existing core/index.ts bootstrap call working until
// it's switched to the BaseService registry.
