import { call } from './_forward'

// Database tool IPC (connect/introspect/query + saved .sql queries).
export const dbService = {
  connect: call('dbConnect'),
  objects: call('dbObjects'),
  columns: call('dbColumns'),
  query: call('dbQuery'),
  disconnect: call('dbDisconnect'),
  savedList: call('dbqList'),
  savedRead: call('dbqRead'),
  savedWrite: call('dbqWrite'),
  savedDelete: call('dbqDelete')
}
