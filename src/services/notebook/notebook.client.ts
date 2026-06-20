import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// Notebook IPC (free-form markdown tree under ~/.crafterm/notebooks).
class NotebookClient extends BaseClient {
  tree = () => this.call(Channel.Notebook.Tree)
  read = (path: string) => this.call(Channel.Notebook.Read, { path })
  write = (path: string, content: string) => this.send(Channel.Notebook.Write, { path, content })
  mkdir = (path: string) => this.call(Channel.Notebook.Mkdir, { path })
  create = (path: string) => this.call(Channel.Notebook.Create, { path })
  rename = (path: string, name: string) => this.call(Channel.Notebook.Rename, { path, name })
  move = (src: string, destDir: string) => this.call(Channel.Notebook.Move, { src, destDir })
  delete = (path: string) => this.call(Channel.Notebook.Delete, { path })
  reveal = (path: string) => this.send(Channel.Notebook.Reveal, { path })
}

export const notebookService = new NotebookClient()
