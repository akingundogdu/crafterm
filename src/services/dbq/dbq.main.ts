import { handle, Channel } from '@services/channels.main'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { stateDir } from '@core/services/paths'

// Saved SQL queries for the Database tool: plain .sql files, namespaced per
// connection under <stateDir>/db-queries/<connId>/.
const dbqSlug = (s: string): string => s.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '')
function dbqDir(connId: string): string | null {
  const slug = dbqSlug(connId)
  return slug ? join(stateDir(), 'db-queries', slug) : null
}
function dbqSafe(name: string): string | null {
  const base = dbqSlug(name)
  if (!base) return null
  return base.endsWith('.sql') ? base : base + '.sql'
}

// Saved SQL queries bridge (dbq:*).
export function registerDbqIpc(): void {
  handle(Channel.Dbq.List, ({ connId }) => {
    const dir = dbqDir(connId)
    if (!dir) return [] as { name: string; path: string }[]
    try {
      return readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((f) => ({ name: f, path: join(dir, f) }))
    } catch {
      return [] as { name: string; path: string }[]
    }
  })
  handle(Channel.Dbq.Read, ({ connId, name }) => {
    const dir = dbqDir(connId)
    const safe = dbqSafe(name)
    if (!dir || !safe) return ''
    try {
      return readFileSync(join(dir, safe), 'utf8')
    } catch {
      return ''
    }
  })
  handle(Channel.Dbq.Write, ({ connId, name, sql }) => {
    const dir = dbqDir(connId)
    const safe = dbqSafe(name)
    if (!dir || !safe) return false
    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, safe), sql)
      return true
    } catch {
      return false
    }
  })
  handle(Channel.Dbq.Delete, ({ connId, name }) => {
    const dir = dbqDir(connId)
    const safe = dbqSafe(name)
    if (!dir || !safe) return false
    try {
      rmSync(join(dir, safe), { force: true })
      return true
    } catch {
      return false
    }
  })
}
