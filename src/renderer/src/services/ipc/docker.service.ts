import { call } from './_forward'

// Docker tool IPC (lists, inspect/logs, actions, prune).
export const dockerService = {
  available: call('dockerAvailable'),
  containers: call('dockerContainers'),
  images: call('dockerImages'),
  volumes: call('dockerVolumes'),
  networks: call('dockerNetworks'),
  compose: call('dockerCompose'),
  stats: call('dockerStats'),
  inspect: call('dockerInspect'),
  logs: call('dockerLogs'),
  action: call('dockerAction'),
  prune: call('dockerPrune')
}
