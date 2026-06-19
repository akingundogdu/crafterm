import { call, send, Channel } from '../channels.client'

// Notebook IPC (free-form markdown tree under ~/.crafterm/notebooks).
export const notebookService = {
  tree: () => call(Channel.Notebook.Tree),
  read: (path: string) => call(Channel.Notebook.Read, { path }),
  write: (path: string, content: string) => send(Channel.Notebook.Write, { path, content }),
  mkdir: (path: string) => call(Channel.Notebook.Mkdir, { path }),
  create: (path: string) => call(Channel.Notebook.Create, { path }),
  rename: (path: string, name: string) => call(Channel.Notebook.Rename, { path, name }),
  move: (src: string, destDir: string) => call(Channel.Notebook.Move, { src, destDir }),
  delete: (path: string) => call(Channel.Notebook.Delete, { path }),
  reveal: (path: string) => send(Channel.Notebook.Reveal, { path })
}
