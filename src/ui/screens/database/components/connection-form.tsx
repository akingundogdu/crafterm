import type { DbConnNode, DbConnection } from '@ui/types/types'
import { ConnectionFormController } from './connection-form.controller'

// Connection form modal: engine segmented control + network/sqlite fields +
// test/save buttons. Pure factory — the connection model is built here from the
// inputs, but IPC (test) is delegated and persistence/tree mutation happens in
// the onSave callback supplied by database.tsx.
export function buildConnectionForm(opts: {
  existing?: DbConnNode
  onSave: (conn: DbConnection) => void
}): void {
  new ConnectionFormController(opts)
}
