import { call, send, Channel } from '../channels.client'

// Filesystem IPC (listing, read/write, create/rename/trash, import resolution,
// open-in-IDE / reveal / open-markdown).
export const fsService = {
  listDir: (path?: string) => call(Channel.Dir.List, { path }),
  listEntries: (path?: string) => call(Channel.Fs.ListEntries, { path }),
  findAllMarkdown: (root?: string) => call(Channel.Md.FindAll, { root }),
  findFiles: (root?: string, exclude?: string[]) => call(Channel.Fs.FindFiles, { root, exclude }),
  resolveFile: (base: string, rel: string) => call(Channel.Fs.ResolveFile, { base, rel }),
  readMd: (path: string) => call(Channel.Fs.ReadMd, { path }),
  readText: (path: string) => call(Channel.Fs.ReadText, { path }),
  writeMd: (path: string, content: string) => call(Channel.Fs.WriteMd, { path, content }),
  writeText: (path: string, content: string) => call(Channel.Fs.WriteText, { path, content }),
  createFile: (path: string) => call(Channel.Fs.CreateFile, { path }),
  mkdir: (path: string) => call(Channel.Fs.Mkdir, { path }),
  renamePath: (from: string, to: string) => call(Channel.Fs.Rename, { from, to }),
  trashPath: (path: string) => call(Channel.Fs.Trash, { path }),
  resolveImport: (fromFile: string, spec: string, symbol?: string) =>
    call(Channel.Fs.ResolveImport, { fromFile, spec, symbol }),
  ideOpen: (path: string, ide: string) => send(Channel.Ide.Open, { path, ide }),
  openPath: (path: string) => send(Channel.Shell.OpenPath, { path }),
  revealPath: (path: string) => send(Channel.Shell.RevealPath, { path }),
  openMarkdown: (path: string) => send(Channel.Markdown.Open, { path })
}
