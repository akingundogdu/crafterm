import { handle } from '@services/channels.main'
import * as fsService from '@core/services/fs.service'

// Filesystem bridge (fs:*): the file explorer + code editor + link finders reach
// the disk through these thin handlers; all logic lives in services/fs.service.ts.
export function registerFsIpc(): void {
  // List a directory's entries (files + folders) for the file explorer.
  handle('fs:listEntries', ({ path }) => fsService.listEntries(path))

  handle('fs:readMd', ({ path }) => fsService.readMd(path))

  // Read any text file (read-only viewer); caps size + rejects binary content.
  handle('fs:readText', ({ path }) => fsService.readText(path))

  handle('fs:writeMd', ({ path, content }) => fsService.writeMd(path, content))

  // Write any text file back to disk (code editor save). Only overwrites an
  // existing regular file — never creates new paths here.
  handle('fs:writeText', ({ path, content }) => fsService.writeText(path, content))

  // Resolve a relative import specifier to an absolute source file (go-to-
  // definition for imports).
  handle('fs:resolveImport', ({ fromFile, spec, symbol }) =>
    fsService.resolveImport(fromFile, spec, symbol)
  )

  // Create an empty file (Files tree → New File). Refuses to overwrite.
  handle('fs:createFile', ({ path }) => fsService.createFile(path))

  // Create a directory (Files tree → New Folder). Refuses an existing path.
  handle('fs:mkdir', ({ path }) => fsService.mkdir(path))

  // Rename/move a path (Files tree → Rename). Refuses if the destination exists.
  handle('fs:rename', ({ from, to }) => fsService.rename(from, to))

  // Move a path to the system Trash (Files tree → Delete). Recoverable, unlike rm.
  handle('fs:trash', ({ path }) => fsService.trash(path))

  // Resolve a path clicked in the terminal to an existing file (tries the cwd and
  // each ancestor directory).
  handle('fs:resolveFile', ({ base, rel }) => fsService.resolveFile(base, rel))

  // Recursively list files under a root (for the notebook "Link file" finder).
  handle('fs:findFiles', ({ root, exclude }) => fsService.findFiles(root, exclude))
}
