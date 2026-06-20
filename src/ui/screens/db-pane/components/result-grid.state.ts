import type { DbColumn } from '@services/db/db.types'
import type { EditableContext, FieldValue, GridContext } from './result-grid.types'
import { promptConfirm } from '@ui/dialog/dialog'
import { dbService } from '@services'
import { quoteIdent, literalOf } from '../sql-literal'

export const PEN_SVG =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M11.5 1.7l2.8 2.8L5.6 13.2 2 14l.8-3.6z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>'
export const TRASH_SVG =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M3 4h10M6 4V2.6h4V4M4.4 4l.7 9.4h5.8L11.6 4M6.8 6.8v4.4M9.2 6.8v4.4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'

// Column-header sort cycle: none → asc → desc → none.
export function cycleSort(ctx: GridContext, col: string): void {
  if (!ctx.onSort) return
  const cur = ctx.sort
  if (!cur || cur.column !== col) ctx.onSort(col, 'asc')
  else if (cur.dir === 'asc') ctx.onSort(col, 'desc')
  else ctx.onSort(null, null) // 3rd click clears sort
}

// Builds the `col = literal AND …` clause from the row's primary-key values, or
// null (after alerting) when a PK column isn't present in the result set.
function pkWhere(ctx: EditableContext, gridColumns: string[], row: unknown[], verb: string): string | null {
  const engine = ctx.conn.engine
  const parts: string[] = []
  for (const c of ctx.columns) {
    if (!c.isPrimary) continue
    const idx = gridColumns.indexOf(c.name)
    if (idx < 0) {
      alert(`Cannot ${verb}: primary-key column "${c.name}" is not in the result.`)
      return null
    }
    parts.push(`${quoteIdent(c.name, engine)} = ${literalOf(row[idx], c.type)}`)
  }
  return parts.length ? parts.join(' AND ') : null
}

export async function deleteRow(
  ctx: EditableContext,
  gridColumns: string[],
  row: unknown[]
): Promise<void> {
  const where = pkWhere(ctx, gridColumns, row, 'delete')
  if (!where) return
  const ok = await promptConfirm({
    title: 'Delete row?',
    message: 'This will run: DELETE FROM ' + ctx.table + ' WHERE ' + where,
    confirmText: 'Delete'
  })
  if (!ok) return
  const sql = `DELETE FROM ${quoteIdent(ctx.table, ctx.conn.engine)} WHERE ${where}`
  const res = await dbService.query(ctx.conn, sql)
  if (res.error) {
    alert('Delete failed: ' + res.error)
    return
  }
  ctx.rerun()
}

// Seed values for the edit modal: each column's current cell as a string + null flag.
export function editInitialValues(
  ctx: EditableContext,
  gridColumns: string[],
  row: unknown[]
): Record<string, FieldValue> {
  const initial: Record<string, FieldValue> = {}
  for (const c of ctx.columns) {
    const idx = gridColumns.indexOf(c.name)
    const raw = idx >= 0 ? row[idx] : null
    initial[c.name] = {
      value: raw === null || raw === undefined ? '' : String(raw),
      isNull: raw === null || raw === undefined
    }
  }
  return initial
}

// Seed values for the insert modal: blank, NULL pre-checked for columns the
// engine can fill (nullable / auto-increment / defaulted).
export function insertInitialValues(ctx: EditableContext): Record<string, FieldValue> {
  const initial: Record<string, FieldValue> = {}
  for (const c of ctx.columns) {
    initial[c.name] = { value: '', isNull: c.nullable || c.isAutoIncrement || c.hasDefault }
  }
  return initial
}

// Builds the UPDATE for the columns the user actually changed, keyed on the old
// PK values. Returns null when nothing changed or a PK column is missing.
export function buildUpdateSql(
  ctx: EditableContext,
  gridColumns: string[],
  row: unknown[],
  updated: Record<string, FieldValue>,
  initial: Record<string, FieldValue>
): string | null {
  const engine = ctx.conn.engine
  const setParts: string[] = []
  for (const c of ctx.columns) {
    if (c.isPrimary) continue // PK is the row identifier, not edited here
    const cur = updated[c.name]
    if (!cur) continue
    const prev = initial[c.name]
    if (cur.isNull === prev.isNull && cur.value === prev.value) continue // unchanged
    const lit = cur.isNull ? 'NULL' : literalOf(cur.value, c.type)
    setParts.push(`${quoteIdent(c.name, engine)} = ${lit}`)
  }
  if (!setParts.length) return null // nothing changed
  const where = pkWhere(ctx, gridColumns, row, 'update')
  if (!where) return null
  return `UPDATE ${quoteIdent(ctx.table, engine)} SET ${setParts.join(', ')} WHERE ${where}`
}

// Builds the INSERT, skipping auto/default/nullable columns the user left NULL.
// Returns null (after alerting) when there's nothing to insert.
export function buildInsertSql(
  ctx: EditableContext,
  values: Record<string, FieldValue>
): string | null {
  const engine = ctx.conn.engine
  const cols: string[] = []
  const lits: string[] = []
  for (const c of ctx.columns) {
    const v = values[c.name]
    if (!v) continue
    if (v.isNull && (c.isAutoIncrement || c.hasDefault || c.nullable)) continue
    cols.push(quoteIdent(c.name, engine))
    lits.push(v.isNull ? 'NULL' : literalOf(v.value, c.type))
  }
  if (!cols.length) {
    alert('Nothing to insert — fill in at least one column.')
    return null
  }
  return `INSERT INTO ${quoteIdent(ctx.table, engine)} (${cols.join(', ')}) VALUES (${lits.join(', ')})`
}

// Reads the current field values out of the row-form inputs.
export function collectFieldValues(
  columns: DbColumn[],
  inputs: Record<string, { input: HTMLInputElement | HTMLTextAreaElement; nullCb: HTMLInputElement }>
): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {}
  for (const c of columns) {
    out[c.name] = { value: inputs[c.name].input.value, isNull: inputs[c.name].nullCb.checked }
  }
  return out
}
