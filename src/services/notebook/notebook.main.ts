import { shell } from 'electron'
import { handle, on, Channel } from '@services/channels.main'
import { existsSync, mkdirSync } from 'fs'
import * as notebook from '@core/services/notebook.service'
import { notebooksDir } from '@core/services/paths'

// Notebook bridge (notebook:*): a free-form folder/.md tree under
// <stateDir>/notebooks. Tree operations live in services/notebook.service.ts;
// these handlers resolve the base dir and delegate.
export function registerNotebookIpc(): void {
  handle(Channel.Notebook.Tree, () => {
    try {
      mkdirSync(notebooksDir(), { recursive: true })
    } catch {
      /* ignore */
    }
    return notebook.tree(notebooksDir())
  })
  handle(Channel.Notebook.Read, ({ path }) => notebook.read(notebooksDir(), path))
  on(Channel.Notebook.Write, ({ path, content }) => {
    notebook.write(notebooksDir(), path, content)
  })
  handle(Channel.Notebook.Mkdir, ({ path }) => notebook.mkdir(notebooksDir(), path))
  handle(Channel.Notebook.Create, ({ path }) => notebook.create(notebooksDir(), path))
  handle(Channel.Notebook.Rename, ({ path, name }) => notebook.rename(notebooksDir(), path, name))
  handle(Channel.Notebook.Move, ({ src, destDir }) => notebook.move(notebooksDir(), src, destDir))
  on(Channel.Notebook.Reveal, ({ path }) => {
    const p = notebook.resolve(notebooksDir(), path)
    if (p && existsSync(p)) shell.showItemInFolder(p)
  })
  handle(Channel.Notebook.Delete, ({ path }) => notebook.del(notebooksDir(), path))
}
