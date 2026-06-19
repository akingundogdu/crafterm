import { call, Channel } from '../channels.client'
import type { DockerKind } from './docker.types'

// Docker tool IPC (lists, inspect/logs, actions, prune).
export const dockerService = {
  available: () => call(Channel.Docker.Available),
  containers: () => call(Channel.Docker.Containers),
  images: () => call(Channel.Docker.Images),
  volumes: () => call(Channel.Docker.Volumes),
  networks: () => call(Channel.Docker.Networks),
  compose: () => call(Channel.Docker.Compose),
  stats: () => call(Channel.Docker.Stats),
  inspect: (kind: DockerKind, id: string) => call(Channel.Docker.Inspect, { kind, id }),
  logs: (id: string, tail?: number) => call(Channel.Docker.Logs, { id, tail }),
  action: (kind: DockerKind | 'compose', action: string, id: string, configFile?: string) =>
    call(Channel.Docker.Action, { kind, action, id, configFile }),
  prune: (target: string) => call(Channel.Docker.Prune, { target })
}
