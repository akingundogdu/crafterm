import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import * as fsModel from '@core/services/fs/fs.service'

// Filesystem IPC adapter (fs:*): the file explorer + code editor + link finders
// reach the disk through these thin handlers; all logic lives in @core/services/fs.
export class FsController extends BaseService {
  readonly name = 'fs'

  register(): void {
    // List a directory's entries (files + folders) for the file explorer.
    this.handle(Channel.Fs.ListEntries, ({ path }) => fsModel.listEntries(path))
    this.handle(Channel.Fs.ReadMd, ({ path }) => fsModel.readMd(path))
    // Read any text file (read-only viewer); caps size + rejects binary content.
    this.handle(Channel.Fs.ReadText, ({ path }) => fsModel.readText(path))
    this.handle(Channel.Fs.WriteMd, ({ path, content }) => fsModel.writeMd(path, content))
    // Write any text file back to disk (code editor save). Only overwrites an
    // existing regular file — never creates new paths here.
    this.handle(Channel.Fs.WriteText, ({ path, content }) => fsModel.writeText(path, content))
    // Write an image pasted into the agent composer to a temp file and hand its
    // absolute path back, so the prompt can point Claude at it.
    this.handle(Channel.Fs.WritePastedImage, ({ data, ext, name, batch }) =>
      fsModel.writePastedImage(data, ext, name, batch)
    )
    // Resolve a relative import specifier to an absolute source file (go-to-
    // definition for imports).
    this.handle(Channel.Fs.ResolveImport, ({ fromFile, spec, symbol }) =>
      fsModel.resolveImport(fromFile, spec, symbol)
    )
    // Create an empty file (Files tree → New File). Refuses to overwrite.
    this.handle(Channel.Fs.CreateFile, ({ path }) => fsModel.createFile(path))
    // Create a directory (Files tree → New Folder). Refuses an existing path.
    this.handle(Channel.Fs.Mkdir, ({ path }) => fsModel.mkdir(path))
    // Rename/move a path (Files tree → Rename). Refuses if the destination exists.
    this.handle(Channel.Fs.Rename, ({ from, to }) => fsModel.rename(from, to))
    // Move a path to the system Trash (Files tree → Delete). Recoverable, unlike rm.
    this.handle(Channel.Fs.Trash, ({ path }) => fsModel.trash(path))
    // Resolve a path clicked in the terminal to an existing file (tries the cwd and
    // each ancestor directory).
    this.handle(Channel.Fs.ResolveFile, ({ base, rel }) => fsModel.resolveFile(base, rel))
    // Recursively list files under a root (for the notebook "Link file" finder).
    this.handle(Channel.Fs.FindFiles, ({ root, exclude }) => fsModel.findFiles(root, exclude))
  }
}

