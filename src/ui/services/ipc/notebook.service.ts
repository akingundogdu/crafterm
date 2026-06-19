import { call } from './_forward'

// Notebook IPC (free-form markdown tree under ~/.crafterm/notebooks).
export const notebookService = {
  tree: call('notebook', 'tree'),
  read: call('notebook', 'read'),
  write: call('notebook', 'write'),
  mkdir: call('notebook', 'mkdir'),
  create: call('notebook', 'create'),
  rename: call('notebook', 'rename'),
  move: call('notebook', 'move'),
  delete: call('notebook', 'delete'),
  reveal: call('notebook', 'reveal')
}
