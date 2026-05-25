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

  ipcMain.handle('db:query', async (_e, { config, sql }: { config: DbConfig; sql: string }) =>
    runQuery(config, sql)
  )

  ipcMain.handle('db:disconnect', async (_e, { id }: { id: string }) => {
    await disconnect(id)
    return true
  })
}
