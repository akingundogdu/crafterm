// Detect a simple `SELECT * FROM <table> [ORDER BY ...] [LIMIT N]` query.
// Captures the table identifier (may be quoted / schema-qualified) and the
// optional LIMIT tail so we can splice ORDER BY between FROM and LIMIT.
export interface ParsedSelect {
  table: string // raw identifier as written (we re-quote when emitting SQL)
  baseSelect: string // `SELECT * FROM <table>` (canonical)
  limitTail: string // ` LIMIT 100` (with leading space) or '' if none
  // The full SQL might have its own ORDER BY clause — when present we drop it
  // because the grid drives sorting from this point on.
}
