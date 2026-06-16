import { call } from './_forward'

// Database tool IPC (connect/introspect/query + saved .sql queries).
export const dbService = {
  connect: call('db', 'connect'),
  objects: call('db', 'objects'),
  columns: call('db', 'columns'),
  query: call('db', 'query'),
  disconnect: call('db', 'disconnect'),
  savedList: call('db', 'savedList'),
  savedRead: call('db', 'savedRead'),
  savedWrite: call('db', 'savedWrite'),
  savedDelete: call('db', 'savedDelete')
}
