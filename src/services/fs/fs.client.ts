import { call, send } from '../channels.client'

// Filesystem IPC (listing, read/write, create/rename/trash, import resolution,
// open-in-IDE / reveal / open-markdown).
export const fsService = {
  listDir: (path?: string) => call('dir:list', { path }),
  listEntries: (path?: string) => call('fs:listEntries', { path }),
  findAllMarkdown: (root?: string) => call('md:findAll', { root }),
  findFiles: (root?: string, exclude?: string[]) => call('fs:findFiles', { root, exclude }),
  resolveFile: (base: string, rel: string) => call('fs:resolveFile', { base, rel }),
  readMd: (path: string) => call('fs:readMd', { path }),
  readText: (path: string) => call('fs:readText', { path }),
  writeMd: (path: string, content: string) => call('fs:writeMd', { path, content }),
  writeText: (path: string, content: string) => call('fs:writeText', { path, content }),
  createFile: (path: string) => call('fs:createFile', { path }),
  mkdir: (path: string) => call('fs:mkdir', { path }),
  renamePath: (from: string, to: string) => call('fs:rename', { from, to }),
  trashPath: (path: string) => call('fs:trash', { path }),
  resolveImport: (fromFile: string, spec: string, symbol?: string) =>
    call('fs:resolveImport', { fromFile, spec, symbol }),
  ideOpen: (path: string, ide: string) => send('ide:open', { path, ide }),
  openPath: (path: string) => send('shell:openPath', { path }),
  revealPath: (path: string) => send('shell:revealPath', { path }),
  openMarkdown: (path: string) => send('markdown:open', { path })
}
