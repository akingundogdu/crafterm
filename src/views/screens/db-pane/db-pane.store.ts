import { sqlPanes } from '@views/state/spine'
import type { DbEngine, DbConnection, DbConnNode } from '@views/types/types'
import type { DbObjects, DbColumn } from '@services/db/db.types'
import type { SqlEditor } from '@views/editor/sql-editor/sql-editor'
import type { SortState } from './components/result-grid'
import type { ParsedSelect } from './db-pane.types'
import { dbConnectionRepo } from '@repositories'
import { quoteIdent } from './sql-literal'

export const PLAY_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M5 3.5l7 4.5-7 4.5z" fill="currentColor"/></svg>'

export function engineClass(e: DbEngine): string {
  return 'db-eng-' + e
}
export function engineLabel(e: DbEngine): string {
  return e === 'postgres' ? 'PostgreSQL' : e === 'mysql' ? 'MySQL' : 'SQLite'
}

export function flattenConns(): DbConnNode[] {
  return dbConnectionRepo.nodes()
}

// Per-pane Monaco editor teardown (dispose on close).
export const sqlEditors = new Map<string, SqlEditor>()

// Per-pane caches.
export const paneObjCache = new Map<string, Map<string, DbObjects>>()
// per-pane, per-(conn:table) column metadata cache; cleared when conn changes.
export const paneColCache = new Map<string, Map<string, DbColumn[]>>()

export function schemaFor(paneId: string, conn: DbConnection): Record<string, string[]> {
  const o = paneObjCache.get(paneId)?.get(conn.id)
  const s: Record<string, string[]> = {}
  if (o) for (const t of [...o.tables, ...o.views]) s[t] = []
  return s
}

// ---- SQL parsing ----------------------------------------------------------

const SIMPLE_SELECT_RE =
  /^\s*select\s+\*\s+from\s+([`"\[]?[\w.]+[`"\]]?(?:\.[`"\[]?[\w]+[`"\]]?)?)\s*(.*?)\s*;?\s*$/i

export function parseSimpleSelect(sqlText: string): ParsedSelect | null {
  const m = sqlText.match(SIMPLE_SELECT_RE)
  if (!m) return null
  const table = m[1]
  const tail = m[2] ?? ''
  // strip a trailing ORDER BY (we'll add our own) but keep LIMIT
  let cleanTail = tail
  cleanTail = cleanTail.replace(/order\s+by[\s\S]*?(?=(\blimit\b|$))/i, '').trim()
  const limitMatch = cleanTail.match(/^limit\s+\d+(\s+offset\s+\d+)?$/i)
  const limitTail = limitMatch ? ' ' + limitMatch[0] : ''
  return { table, baseSelect: `SELECT * FROM ${table}`, limitTail }
}

export function emitOrderedSql(parsed: ParsedSelect, engine: DbEngine, sort: SortState | null): string {
  let s = parsed.baseSelect
  if (sort) s += ` ORDER BY ${quoteIdent(sort.column, engine)} ${sort.dir.toUpperCase()}`
  s += parsed.limitTail
  return s
}

export function destroySqlPane(id: string): void {
  sqlEditors.get(id)?.dispose()
  sqlEditors.delete(id)
  sqlPanes.delete(id)
  paneObjCache.delete(id)
  paneColCache.delete(id)
}
