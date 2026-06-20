import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'
import type { DockerKind } from './docker.types'

// Docker tool IPC (lists, inspect/logs, actions, prune).
class DockerClient extends BaseClient {
  available = () => this.call(Channel.Docker.Available)
  containers = () => this.call(Channel.Docker.Containers)
  images = () => this.call(Channel.Docker.Images)
  volumes = () => this.call(Channel.Docker.Volumes)
  networks = () => this.call(Channel.Docker.Networks)
  compose = () => this.call(Channel.Docker.Compose)
  stats = () => this.call(Channel.Docker.Stats)
  inspect = (kind: DockerKind, id: string) => this.call(Channel.Docker.Inspect, { kind, id })
  logs = (id: string, tail?: number) => this.call(Channel.Docker.Logs, { id, tail })
  action = (kind: DockerKind | 'compose', action: string, id: string, configFile?: string) =>
    this.call(Channel.Docker.Action, { kind, action, id, configFile })
  prune = (target: string) => this.call(Channel.Docker.Prune, { target })
}

export const dockerService = new DockerClient()
