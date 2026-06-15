import { call } from './_forward'

// Filesystem IPC (listing, read/write, create/rename/trash, import resolution,
// open-in-IDE / reveal / open-markdown).
export const fsService = {
  listDir: call('listDir'),
  listEntries: call('listEntries'),
  findAllMarkdown: call('findAllMarkdown'),
  findFiles: call('findFiles'),
  resolveFile: call('resolveFile'),
  readMd: call('readMd'),
  readText: call('readText'),
  writeMd: call('writeMd'),
  writeText: call('writeText'),
  createFile: call('createFile'),
  mkdir: call('mkdir'),
  renamePath: call('renamePath'),
  trashPath: call('trashPath'),
  resolveImport: call('resolveImport'),
  ideOpen: call('ideOpen'),
  openPath: call('openPath'),
  revealPath: call('revealPath'),
  openMarkdown: call('openMarkdown')
}
