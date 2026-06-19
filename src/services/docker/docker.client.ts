import { call } from '../channels.client'
import type { DockerKind } from './docker.types'

// Docker tool IPC (lists, inspect/logs, actions, prune).
export const dockerService = {
  available: () => call('docker:available'),
  containers: () => call('docker:containers'),
  images: () => call('docker:images'),
  volumes: () => call('docker:volumes'),
  networks: () => call('docker:networks'),
  compose: () => call('docker:compose'),
  stats: () => call('docker:stats'),
  inspect: (kind: DockerKind, id: string) => call('docker:inspect', { kind, id }),
  logs: (id: string, tail?: number) => call('docker:logs', { id, tail }),
  action: (kind: DockerKind | 'compose', action: string, id: string, configFile?: string) =>
    call('docker:action', { kind, action, id, configFile }),
  prune: (target: string) => call('docker:prune', { target })
}
