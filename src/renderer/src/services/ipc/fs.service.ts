import { call } from './_forward'

// Filesystem IPC (listing, read/write, create/rename/trash, import resolution,
// open-in-IDE / reveal / open-markdown).
export const fsService = {
  listDir: call('fs', 'listDir'),
  listEntries: call('fs', 'listEntries'),
  findAllMarkdown: call('fs', 'findAllMarkdown'),
  findFiles: call('fs', 'findFiles'),
  resolveFile: call('fs', 'resolveFile'),
  readMd: call('fs', 'readMd'),
  readText: call('fs', 'readText'),
  writeMd: call('fs', 'writeMd'),
  writeText: call('fs', 'writeText'),
  createFile: call('fs', 'createFile'),
  mkdir: call('fs', 'mkdir'),
  renamePath: call('fs', 'renamePath'),
  trashPath: call('fs', 'trashPath'),
  resolveImport: call('fs', 'resolveImport'),
  ideOpen: call('fs', 'ideOpen'),
  openPath: call('fs', 'openPath'),
  revealPath: call('fs', 'revealPath'),
  openMarkdown: call('fs', 'openMarkdown')
}
