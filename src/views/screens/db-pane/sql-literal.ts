import type { DbEngine } from '@views/types/types'

// Pure SQL identifier/literal formatting for the result grid's edit/insert/delete
// statements. No DOM/IPC — unit-testable in isolation.

export function escSingle(s: string): string {
  return s.replace(/'/g, "''")
}

// Quote a column or table identifier for the given engine.
export function quoteIdent(name: string, engine: DbEngine): string {
  // dotted names ("schema.table") are quoted segment-by-segment.
  return name
    .split('.')
    .map((part) => {
      const bare = part.replace(/^["`[]|["`\]]$/g, '')
      if (engine === 'mysql') return '`' + bare.replace(/`/g, '``') + '`'
      return '"' + bare.replace(/"/g, '""') + '"'
    })
    .join('.')
}

// Format a JS value as a SQL literal. Caller decides nullability — pass `null`
// explicitly to emit NULL.
export function literalOf(value: unknown, type: string): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (value instanceof Date) return "'" + escSingle(value.toISOString()) + "'"
  // Numeric/boolean column with a string value: try to coerce so the DB doesn't
  // reject a quoted number.
  const s = String(value)
  if (/^(int|numeric|decimal|float|double|real|bigint|smallint|tinyint)/i.test(type)) {
    if (s === '') return 'NULL'
    if (/^-?\d+(\.\d+)?$/.test(s)) return s
  }
  if (/^bool/i.test(type)) {
    if (s === '') return 'NULL'
    if (/^(true|t|1)$/i.test(s)) return 'TRUE'
    if (/^(false|f|0)$/i.test(s)) return 'FALSE'
  }
  return "'" + escSingle(s) + "'"
}
