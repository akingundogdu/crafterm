import { ipcMain, shell } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import * as notebook from '../services/notebook.service'
import { notebooksDir } from '../services/paths'

// Notebook bridge (notebook:*): a free-form folder/.md tree under
// <stateDir>/notebooks. Tree operations live in services/notebook.service.ts;
// these handlers resolve the base dir and delegate.
export function registerNotebookIpc(): void {
  ipcMain.handle('notebook:tree', () => {
    try {
      mkdirSync(notebooksDir(), { recursive: true })
    } catch {
      /* ignore */
    }
    return notebook.tree(notebooksDir())
  })
  ipcMain.handle('notebook:read', (_e, { path }: { path: string }) =>
    notebook.read(notebooksDir(), path)
  )
  ipcMain.on('notebook:write', (_e, { path, content }: { path: string; content: string }) => {
    notebook.write(notebooksDir(), path, content)
  })
  ipcMain.handle('notebook:mkdir', (_e, { path }: { path: string }) =>
    notebook.mkdir(notebooksDir(), path)
  )
  ipcMain.handle('notebook:create', (_e, { path }: { path: string }) =>
    notebook.create(notebooksDir(), path)
  )
  ipcMain.handle('notebook:rename', (_e, { path, name }: { path: string; name: string }) =>
    notebook.rename(notebooksDir(), path, name)
  )
  ipcMain.handle('notebook:move', (_e, { src, destDir }: { src: string; destDir: string }) =>
    notebook.move(notebooksDir(), src, destDir)
  )
  ipcMain.on('notebook:reveal', (_e, { path }: { path: string }) => {
    const p = notebook.resolve(notebooksDir(), path)
    if (p && existsSync(p)) shell.showItemInFolder(p)
  })
  ipcMain.handle('notebook:delete', (_e, { path }: { path: string }) =>
    notebook.del(notebooksDir(), path)
  )
}
