import { shell } from 'electron'
import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { existsSync, mkdirSync } from 'fs'
import * as notebook from '@core/services/notebook/notebook.service'
import { notebooksDir } from '@core/services/paths/paths.service'

// Notebook IPC adapter (notebook:*): a free-form folder/.md tree under
// <stateDir>/notebooks. Tree operations live in @core/services/notebook; these
// handlers resolve the base dir and delegate (thin enough to need no .service.ts).
export class NotebookController extends BaseService {
  readonly name = 'notebook'

  register(): void {
    this.handle(Channel.Notebook.Tree, () => {
      try {
        mkdirSync(notebooksDir(), { recursive: true })
      } catch {
        /* ignore */
      }
      return notebook.tree(notebooksDir())
    })
    this.handle(Channel.Notebook.Read, ({ path }) => notebook.read(notebooksDir(), path))
    this.on(Channel.Notebook.Write, ({ path, content }) => {
      notebook.write(notebooksDir(), path, content)
    })
    this.handle(Channel.Notebook.Mkdir, ({ path }) => notebook.mkdir(notebooksDir(), path))
    this.handle(Channel.Notebook.Create, ({ path }) => notebook.create(notebooksDir(), path))
    this.handle(Channel.Notebook.Rename, ({ path, name }) => notebook.rename(notebooksDir(), path, name))
    this.handle(Channel.Notebook.Move, ({ src, destDir }) => notebook.move(notebooksDir(), src, destDir))
    this.on(Channel.Notebook.Reveal, ({ path }) => {
      const p = notebook.resolve(notebooksDir(), path)
      if (p && existsSync(p)) shell.showItemInFolder(p)
    })
    this.handle(Channel.Notebook.Delete, ({ path }) => notebook.del(notebooksDir(), path))
  }
}

