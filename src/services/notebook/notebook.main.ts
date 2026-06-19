import { shell } from 'electron'
import { handle, on } from '@services/channels.main'
import { existsSync, mkdirSync } from 'fs'
import * as notebook from '@core/services/notebook.service'
import { notebooksDir } from '@core/services/paths'

// Notebook bridge (notebook:*): a free-form folder/.md tree under
// <stateDir>/notebooks. Tree operations live in services/notebook.service.ts;
// these handlers resolve the base dir and delegate.
export function registerNotebookIpc(): void {
  handle('notebook:tree', () => {
    try {
      mkdirSync(notebooksDir(), { recursive: true })
    } catch {
      /* ignore */
    }
    return notebook.tree(notebooksDir())
  })
  handle('notebook:read', ({ path }) => notebook.read(notebooksDir(), path))
  on('notebook:write', ({ path, content }) => {
    notebook.write(notebooksDir(), path, content)
  })
  handle('notebook:mkdir', ({ path }) => notebook.mkdir(notebooksDir(), path))
  handle('notebook:create', ({ path }) => notebook.create(notebooksDir(), path))
  handle('notebook:rename', ({ path, name }) => notebook.rename(notebooksDir(), path, name))
  handle('notebook:move', ({ src, destDir }) => notebook.move(notebooksDir(), src, destDir))
  on('notebook:reveal', ({ path }) => {
    const p = notebook.resolve(notebooksDir(), path)
    if (p && existsSync(p)) shell.showItemInFolder(p)
  })
  handle('notebook:delete', ({ path }) => notebook.del(notebooksDir(), path))
}
