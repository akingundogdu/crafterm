import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { stateDir } from '@core/services/paths/paths.service'
import type { SavedQueryRef } from './dbq.types'

// Saved SQL queries domain logic for the Database tool: plain .sql files,
// namespaced per connection under <stateDir>/db-queries/<connId>/. No IPC wiring
// (that's the DbqController adapter in dbq.main.ts).
export class DbqService {
  private slug(s: string): string {
    return s.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '')
  }

  private dir(connId: string): string | null {
    const slug = this.slug(connId)
    return slug ? join(stateDir(), 'db-queries', slug) : null
  }

  private safe(name: string): string | null {
    const base = this.slug(name)
    if (!base) return null
    return base.endsWith('.sql') ? base : base + '.sql'
  }

  list(connId: string): SavedQueryRef[] {
    const dir = this.dir(connId)
    if (!dir) return []
    try {
      return readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((f) => ({ name: f, path: join(dir, f) }))
    } catch {
      return []
    }
  }

  read(connId: string, name: string): string {
    const dir = this.dir(connId)
    const safe = this.safe(name)
    if (!dir || !safe) return ''
    try {
      return readFileSync(join(dir, safe), 'utf8')
    } catch {
      return ''
    }
  }

  write(connId: string, name: string, sql: string): boolean {
    const dir = this.dir(connId)
    const safe = this.safe(name)
    if (!dir || !safe) return false
    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, safe), sql)
      return true
    } catch {
      return false
    }
  }

  delete(connId: string, name: string): boolean {
    const dir = this.dir(connId)
    const safe = this.safe(name)
    if (!dir || !safe) return false
    try {
      rmSync(join(dir, safe), { force: true })
      return true
    } catch {
      return false
    }
  }
}
