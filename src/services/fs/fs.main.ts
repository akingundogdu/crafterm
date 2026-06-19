import { ipcMain } from 'electron'
import * as fsService from '@core/services/fs.service'

// Filesystem bridge (fs:*): the file explorer + code editor + link finders reach
// the disk through these thin handlers; all logic lives in services/fs.service.ts.
export function registerFsIpc(): void {
  // List a directory's entries (files + folders) for the file explorer.
  ipcMain.handle('fs:listEntries', (_e, { path }: { path?: string }) => fsService.listEntries(path))

  ipcMain.handle('fs:readMd', (_e, { path }: { path: string }) => fsService.readMd(path))

  // Read any text file (read-only viewer); caps size + rejects binary content.
  ipcMain.handle('fs:readText', (_e, { path }: { path: string }) => fsService.readText(path))

  ipcMain.handle('fs:writeMd', (_e, { path, content }: { path: string; content: string }) =>
    fsService.writeMd(path, content)
  )

  // Write any text file back to disk (code editor save). Only overwrites an
  // existing regular file — never creates new paths here.
  ipcMain.handle('fs:writeText', (_e, { path, content }: { path: string; content: string }) =>
    fsService.writeText(path, content)
  )

  // Resolve a relative import specifier to an absolute source file (go-to-
  // definition for imports).
  ipcMain.handle(
    'fs:resolveImport',
    (_e, { fromFile, spec, symbol }: { fromFile: string; spec: string; symbol?: string }) =>
      fsService.resolveImport(fromFile, spec, symbol)
  )

  // Create an empty file (Files tree → New File). Refuses to overwrite.
  ipcMain.handle('fs:createFile', (_e, { path }: { path: string }) => fsService.createFile(path))

  // Create a directory (Files tree → New Folder). Refuses an existing path.
  ipcMain.handle('fs:mkdir', (_e, { path }: { path: string }) => fsService.mkdir(path))

  // Rename/move a path (Files tree → Rename). Refuses if the destination exists.
  ipcMain.handle('fs:rename', (_e, { from, to }: { from: string; to: string }) =>
    fsService.rename(from, to)
  )

  // Move a path to the system Trash (Files tree → Delete). Recoverable, unlike rm.
  ipcMain.handle('fs:trash', (_e, { path }: { path: string }) => fsService.trash(path))

  // Resolve a path clicked in the terminal to an existing file (tries the cwd and
  // each ancestor directory).
  ipcMain.handle('fs:resolveFile', (_e, { base, rel }: { base?: string; rel: string }) =>
    fsService.resolveFile(base, rel)
  )

  // Recursively list files under a root (for the notebook "Link file" finder).
  ipcMain.handle('fs:findFiles', (_e, { root, exclude }: { root?: string; exclude?: string[] }) =>
    fsService.findFiles(root, exclude)
  )
}
