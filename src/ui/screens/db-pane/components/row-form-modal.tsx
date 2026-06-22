import type { DbColumn } from '@services/db/db.types'
import type { FieldValue } from './result-grid.types'
import { RowFormModalController } from './row-form-modal.controller'

// Shared edit/insert modal: a field input per column (textarea for text-ish
// types) with a NULL toggle. Resolves to the collected values or null on
// cancel. Pure — the host builds the SQL and runs it.
export function openRowFormModal(opts: {
  title: string
  submitText: string
  columns: DbColumn[]
  initial: Record<string, FieldValue>
  pkLocked: boolean // edit: PKs are read-only; insert: PKs are editable
}): Promise<Record<string, FieldValue> | null> {
  return new RowFormModalController(opts).open()
}
