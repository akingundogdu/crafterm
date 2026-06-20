import type { DbColumn } from '@services/db/db.types'
import type { DbConnection } from '@ui/types/types'

export interface SortState {
  column: string
  dir: 'asc' | 'desc'
}

export interface EditableContext {
  conn: DbConnection
  table: string // table identifier as it appears in the SELECT (may be "schema.name")
  columns: DbColumn[] // metadata for the table (PK detection, types)
  // Re-run the current SQL (e.g. after edit/insert/delete) with the latest sort.
  rerun: () => void
}

export interface GridContext {
  columns: string[]
  rows: unknown[][]
  ms: number
  sort: SortState | null
  onSort?: (col: string | null, dir: 'asc' | 'desc' | null) => void
  editable?: EditableContext // when present, show row actions + "+ New row"
}

export interface FieldValue {
  value: string
  isNull: boolean
}
