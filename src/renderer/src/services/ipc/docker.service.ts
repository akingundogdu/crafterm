import { call } from './_forward'

// Docker tool IPC (lists, inspect/logs, actions, prune).
export const dockerService = {
  available: call('docker', 'available'),
  containers: call('docker', 'containers'),
  images: call('docker', 'images'),
  volumes: call('docker', 'volumes'),
  networks: call('docker', 'networks'),
  compose: call('docker', 'compose'),
  stats: call('docker', 'stats'),
  inspect: call('docker', 'inspect'),
  logs: call('docker', 'logs'),
  action: call('docker', 'action'),
  prune: call('docker', 'prune')
}
