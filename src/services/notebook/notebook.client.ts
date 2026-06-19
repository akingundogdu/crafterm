import { call, send } from '../channels.client'

// Notebook IPC (free-form markdown tree under ~/.crafterm/notebooks).
export const notebookService = {
  tree: () => call('notebook:tree'),
  read: (path: string) => call('notebook:read', { path }),
  write: (path: string, content: string) => send('notebook:write', { path, content }),
  mkdir: (path: string) => call('notebook:mkdir', { path }),
  create: (path: string) => call('notebook:create', { path }),
  rename: (path: string, name: string) => call('notebook:rename', { path, name }),
  move: (src: string, destDir: string) => call('notebook:move', { src, destDir }),
  delete: (path: string) => call('notebook:delete', { path }),
  reveal: (path: string) => send('notebook:reveal', { path })
}
