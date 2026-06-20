// User-facing copy for the Docker screen (right panel → Docker + detail modal).
export const Docker = {
  tabs: {
    containers: 'Containers',
    images: 'Images',
    volumes: 'Volumes',
    networks: 'Networks',
    compose: 'Compose'
  },
  retry: 'Retry',
  loading: 'Loading…',
  actionFailed: 'Action failed',
  unknownError: 'unknown error',
  empty: {
    containers: 'No containers',
    images: 'No images',
    volumes: 'No volumes',
    networks: 'No networks',
    compose: 'No compose projects'
  },
  actions: {
    stop: 'Stop',
    restart: 'Restart',
    exec: 'Exec',
    start: 'Start',
    logs: 'Logs',
    inspect: 'Inspect',
    remove: 'Remove',
    down: 'Down'
  },
  detail: {
    rawJson: 'Raw JSON',
    structured: 'Structured',
    inspect: 'Inspect',
    logs: 'Logs',
    terminal: 'Terminal'
  },
  confirm: {
    composeDown: 'Compose down',
    remove: 'Remove',
    stopAndRemove: 'Stop and remove',
    down: 'Down'
  }
} as const
