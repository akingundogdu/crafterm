import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// Filesystem IPC (listing, read/write, create/rename/trash, import resolution).
// Directory listing, IDE open, shell open/reveal, and markdown live in their own
// dir/ide/shell/markdown clients.
class FsClient extends BaseClient {
  listEntries = (path?: string) => this.call(Channel.Fs.ListEntries, { path })
  findFiles = (root?: string, exclude?: string[]) => this.call(Channel.Fs.FindFiles, { root, exclude })
  resolveFile = (base: string, rel: string) => this.call(Channel.Fs.ResolveFile, { base, rel })
  readMd = (path: string) => this.call(Channel.Fs.ReadMd, { path })
  readText = (path: string) => this.call(Channel.Fs.ReadText, { path })
  writeMd = (path: string, content: string) => this.call(Channel.Fs.WriteMd, { path, content })
  writeText = (path: string, content: string) => this.call(Channel.Fs.WriteText, { path, content })
  writePastedImage = (data: string, ext: string, name: string, batch: string) =>
    this.call(Channel.Fs.WritePastedImage, { data, ext, name, batch })
  createFile = (path: string) => this.call(Channel.Fs.CreateFile, { path })
  mkdir = (path: string) => this.call(Channel.Fs.Mkdir, { path })
  renamePath = (from: string, to: string) => this.call(Channel.Fs.Rename, { from, to })
  trashPath = (path: string) => this.call(Channel.Fs.Trash, { path })
  resolveImport = (fromFile: string, spec: string, symbol?: string) =>
    this.call(Channel.Fs.ResolveImport, { fromFile, spec, symbol })
}

export const fsService = new FsClient()
