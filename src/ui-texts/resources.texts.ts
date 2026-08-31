// User-facing copy for the status-bar resource chip (machine CPU + memory) and
// its popover (memory breakdown + top applications).
export const Resources = {
  chip: {
    cpu: 'CPU',
    ram: 'RAM',
    title: 'Machine CPU + memory — click for details',
    loading: '—'
  },
  popover: {
    title: 'Resource usage',
    cpu: 'CPU',
    memory: 'Memory',
    swap: 'Swap',
    cores: (count: number): string => `${count} cores`,
    load: (value: number): string => `load ${value.toFixed(2)}`,
    breakdown: {
      app: 'App memory',
      wired: 'Wired',
      compressed: 'Compressed',
      cached: 'Cached files'
    },
    of: (used: string, total: string): string => `${used} of ${total}`,
    sortCpu: 'Top CPU',
    sortMemory: 'Top memory',
    columnApp: 'Application',
    empty: 'Reading processes…',
    quit: 'Quit',
    force: 'Force',
    quitTitle: (name: string): string => `Quit ${name}`,
    forceTitle: (name: string): string => `Force quit ${name}`,
    ownApp: 'This app',
    quitFailed: 'Could not quit that application'
  },
  confirm: {
    quitTitle: 'Quit application',
    forceTitle: 'Force quit application',
    quitMessage: (name: string, count: number): string =>
      `Send a quit request to ${name}${count > 1 ? ` (${count} processes)` : ''}? Unsaved work may be lost.`,
    forceMessage: (name: string, count: number): string =>
      `Force quit ${name}${count > 1 ? ` (${count} processes)` : ''}? It is killed immediately and unsaved work is lost.`,
    quitConfirm: 'Quit',
    forceConfirm: 'Force quit'
  }
} as const
