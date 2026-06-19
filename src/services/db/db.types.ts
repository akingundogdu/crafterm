// Database tool domain data models (moved out of the former bridge api.d.ts;
// the main-process driver in @core/db imports the same shapes from here).
export type DbEngine = 'postgres' | 'mysql' | 'sqlite'
export interface DbConfig {
  id: string
  engine: DbEngine
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  ssl?: boolean
  file?: string
}
export interface DbResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  command?: string
  error?: string
}
export interface DbObjects {
  tables: string[]
  views: string[]
  procedures: string[]
  error?: string
}
export interface DbColumn {
  name: string
  type: string
  nullable: boolean
  isPrimary: boolean
  isAutoIncrement: boolean
  hasDefault: boolean
}
export interface DbColumns {
  columns: DbColumn[]
  error?: string
}

// Saved query metadata (dbq:list).
export interface SavedQueryRef {
  name: string
  path: string
}
