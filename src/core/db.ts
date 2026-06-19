import { ipcMain } from 'electron'
import { homedir } from 'os'
import { join } from 'path'
import { Pool as PgPool } from 'pg'
import * as mysql from 'mysql2/promise'
import Database from 'better-sqlite3'

// Database tool: connect to Postgres/MySQL/SQLite, introspect objects, run SQL.
// Live handles are cached by connection id; the renderer passes the full config
// on each call (passwords live in app state, the user's explicit choice).

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
  file?: string // sqlite
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

// Column metadata for a single table. `isPrimary` lets the UI build correct
// WHERE clauses for UPDATE/DELETE; `isAutoIncrement` disables the column in
// the INSERT modal (the engine fills it).
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

const pgPools = new Map<string, PgPool>()
const myPools = new Map<string, mysql.Pool>()
const sqliteDbs = new Map<string, Database.Database>()

function resolveFile(p: string): string {
  let f = p.trim()
  if (f.startsWith('~')) f = join(homedir(), f.slice(1))
  return f
}

function pgPool(cfg: DbConfig): PgPool {
  let pool = pgPools.get(cfg.id)
  if (!pool) {
    pool = new PgPool({
      host: cfg.host,
      port: cfg.port || 5432,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
      max: 4
    })
    pgPools.set(cfg.id, pool)
  }
  return pool
}

async function myPool(cfg: DbConfig): Promise<mysql.Pool> {
  let pool = myPools.get(cfg.id)
  if (!pool) {
    pool = mysql.createPool({
      host: cfg.host,
      port: cfg.port || 3306,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined,
      connectionLimit: 4
    })
    myPools.set(cfg.id, pool)
  }
  return pool
}

function sqliteDb(cfg: DbConfig): Database.Database {
  let db = sqliteDbs.get(cfg.id)
  if (!db) {
    db = new Database(resolveFile(cfg.file || ''), { fileMustExist: false })
    sqliteDbs.set(cfg.id, db)
  }
  return db
}

// Normalize a Postgres/MySQL row-object result into columns + row arrays.
function objectsToGrid(rows: Record<string, unknown>[], columns: string[]): unknown[][] {
  return rows.map((r) => columns.map((c) => r[c]))
}

async function runPg(cfg: DbConfig, sql: string): Promise<DbResult> {
  const res = await pgPool(cfg).query(sql)
  const columns = res.fields?.map((f) => f.name) ?? []
  const rows = Array.isArray(res.rows) ? objectsToGrid(res.rows as Record<string, unknown>[], columns) : []
  return { columns, rows, rowCount: res.rowCount ?? rows.length, command: res.command }
}

async function runMy(cfg: DbConfig, sql: string): Promise<DbResult> {
  const pool = await myPool(cfg)
  const [result, fields] = await pool.query(sql)
  if (Array.isArray(fields) && fields.length) {
    const columns = (fields as { name: string }[]).map((f) => f.name)
    const rows = objectsToGrid(result as Record<string, unknown>[], columns)
    return { columns, rows, rowCount: rows.length }
  }
  const ok = result as { affectedRows?: number }
  return { columns: [], rows: [], rowCount: ok.affectedRows ?? 0, command: 'OK' }
}

function runSqlite(cfg: DbConfig, sql: string): DbResult {
  const db = sqliteDb(cfg)
  const stmt = db.prepare(sql)
  if (stmt.reader) {
    const columns = stmt.columns().map((c) => c.name)
    const rows = (stmt.all() as Record<string, unknown>[]).map((r) => columns.map((c) => r[c]))
    return { columns, rows, rowCount: rows.length }
  }
  const info = stmt.run()
  return { columns: [], rows: [], rowCount: info.changes, command: 'OK' }
}

async function runQuery(cfg: DbConfig, sql: string): Promise<DbResult> {
  try {
    if (cfg.engine === 'postgres') return await runPg(cfg, sql)
    if (cfg.engine === 'mysql') return await runMy(cfg, sql)
    return runSqlite(cfg, sql)
  } catch (e) {
    return { columns: [], rows: [], rowCount: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

async function listObjects(cfg: DbConfig): Promise<DbObjects> {
  const col0 = (r: DbResult): string[] => r.rows.map((row) => String(row[0]))
  try {
    if (cfg.engine === 'postgres') {
      const tables = await runPg(
        cfg,
        "select table_name from information_schema.tables where table_schema not in ('pg_catalog','information_schema') and table_type='BASE TABLE' order by table_name"
      )
      const views = await runPg(
        cfg,
        "select table_name from information_schema.tables where table_schema not in ('pg_catalog','information_schema') and table_type='VIEW' order by table_name"
      )
      const procs = await runPg(
        cfg,
        "select routine_name from information_schema.routines where routine_schema not in ('pg_catalog','information_schema') order by routine_name"
      )
      return { tables: col0(tables), views: col0(views), procedures: col0(procs) }
    }
    if (cfg.engine === 'mysql') {
      const tables = await runMy(
        cfg,
        "select table_name from information_schema.tables where table_schema=database() and table_type='BASE TABLE' order by table_name"
      )
      const views = await runMy(
        cfg,
        "select table_name from information_schema.tables where table_schema=database() and table_type='VIEW' order by table_name"
      )
      const procs = await runMy(
        cfg,
        'select routine_name from information_schema.routines where routine_schema=database() order by routine_name'
      )
      return { tables: col0(tables), views: col0(views), procedures: col0(procs) }
    }
    const tables = runSqlite(
      cfg,
      "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name"
    )
    const views = runSqlite(cfg, "select name from sqlite_master where type='view' order by name")
    return { tables: col0(tables), views: col0(views), procedures: [] }
  } catch (e) {
    return { tables: [], views: [], procedures: [], error: e instanceof Error ? e.message : String(e) }
  }
}

// Pull column metadata for a single table. The `table` string is taken as-is
// from the user's SELECT (we only enable this for simple SELECT * FROM <table>),
// so it may include a "schema.name" qualifier — strip the leading schema for
// information_schema lookups when present.
async function listColumns(cfg: DbConfig, table: string): Promise<DbColumns> {
  const unquote = (s: string): string => s.replace(/^["`\[]|["`\]]$/g, '')
  const parts = table.split('.').map(unquote)
  const schema = parts.length > 1 ? parts[0] : null
  const name = parts[parts.length - 1]

  try {
    if (cfg.engine === 'postgres') {
      const escape = (s: string): string => s.replace(/'/g, "''")
      const sql = `
        select
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          (case when k.column_name is not null then true else false end) as is_pk,
          (c.column_default like 'nextval(%') as is_autoinc
        from information_schema.columns c
        left join (
          select kcu.column_name
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu
            on kcu.constraint_name = tc.constraint_name
           and kcu.table_schema = tc.table_schema
          where tc.constraint_type = 'PRIMARY KEY'
            and tc.table_name = '${escape(name)}'
            ${schema ? `and tc.table_schema = '${escape(schema)}'` : ''}
        ) k on k.column_name = c.column_name
        where c.table_name = '${escape(name)}'
          ${schema ? `and c.table_schema = '${escape(schema)}'` : ''}
        order by c.ordinal_position`
      const r = await runPg(cfg, sql)
      const columns: DbColumn[] = r.rows.map((row) => ({
        name: String(row[0]),
        type: String(row[1]),
        nullable: String(row[2]).toLowerCase() === 'yes',
        hasDefault: row[3] !== null && row[3] !== undefined,
        isPrimary: row[4] === true,
        isAutoIncrement: row[5] === true
      }))
      return { columns }
    }
    if (cfg.engine === 'mysql') {
      const escape = (s: string): string => s.replace(/'/g, "''")
      const sql = `
        select
          column_name,
          data_type,
          is_nullable,
          column_default,
          column_key,
          extra
        from information_schema.columns
        where table_schema = ${schema ? `'${escape(schema)}'` : 'database()'}
          and table_name = '${escape(name)}'
        order by ordinal_position`
      const r = await runMy(cfg, sql)
      const columns: DbColumn[] = r.rows.map((row) => ({
        name: String(row[0]),
        type: String(row[1]),
        nullable: String(row[2]).toLowerCase() === 'yes',
        hasDefault: row[3] !== null && row[3] !== undefined,
        isPrimary: String(row[4]).toUpperCase() === 'PRI',
        isAutoIncrement: String(row[5] ?? '').toLowerCase().includes('auto_increment')
      }))
      return { columns }
    }
    // sqlite: PRAGMA table_info returns cid, name, type, notnull, dflt_value, pk
    const db = sqliteDb(cfg)
    const rows = db.prepare(`pragma table_info(${name})`).all() as {
      name: string
      type: string
      notnull: number
      dflt_value: unknown
      pk: number
    }[]
    // SQLite uses INTEGER PRIMARY KEY (with rowid alias) as auto-increment.
    const columns: DbColumn[] = rows.map((r) => ({
      name: r.name,
      type: r.type,
      nullable: r.notnull === 0,
      hasDefault: r.dflt_value !== null && r.dflt_value !== undefined,
      isPrimary: r.pk > 0,
      isAutoIncrement: r.pk > 0 && /int/i.test(r.type)
    }))
    return { columns }
  } catch (e) {
    return { columns: [], error: e instanceof Error ? e.message : String(e) }
  }
}

async function disconnect(id: string): Promise<void> {
  const pg = pgPools.get(id)
  if (pg) {
    pgPools.delete(id)
    try {
      await pg.end()
    } catch {
      /* ignore */
    }
  }
  const my = myPools.get(id)
  if (my) {
    myPools.delete(id)
    try {
      await my.end()
    } catch {
      /* ignore */
    }
  }
  const sq = sqliteDbs.get(id)
  if (sq) {
    sqliteDbs.delete(id)
    try {
      sq.close()
    } catch {
      /* ignore */
    }
  }
}

export function registerDbIpc(): void {
  // Validate a connection by running a trivial query; returns { error } on failure.
  ipcMain.handle('db:connect', async (_e, { config }: { config: DbConfig }) => {
    await disconnect(config.id) // re-create with the latest config
    const probe = config.engine === 'sqlite' ? 'select 1' : 'select 1'
    const res = await runQuery(config, probe)
    return { ok: !res.error, error: res.error }
  })

  ipcMain.handle('db:objects', async (_e, { config }: { config: DbConfig }) => listObjects(config))

  ipcMain.handle(
    'db:columns',
    async (_e, { config, table }: { config: DbConfig; table: string }) => listColumns(config, table)
  )

  ipcMain.handle('db:query', async (_e, { config, sql }: { config: DbConfig; sql: string }) =>
    runQuery(config, sql)
  )

  ipcMain.handle('db:disconnect', async (_e, { id }: { id: string }) => {
    await disconnect(id)
    return true
  })
}
