import { call } from './_forward'

// Notebook IPC (free-form markdown tree under ~/.crafterm/notebooks).
export const notebookService = {
  tree: call('nbTree'),
  read: call('nbRead'),
  write: call('nbWrite'),
  mkdir: call('nbMkdir'),
  create: call('nbCreate'),
  rename: call('nbRename'),
  move: call('nbMove'),
  delete: call('nbDelete'),
  reveal: call('nbReveal')
}
