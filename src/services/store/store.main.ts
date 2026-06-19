import { handle, on, Channel } from '@services/channels.main'
import { join } from 'path'
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  readdirSync,
  unlinkSync
} from 'fs'
import { stateDir, statePath } from '@core/services/paths'

// Bumped when the persisted shape changes (kept in sync with the renderer's
// SCHEMA_VERSION in state.ts). State whose schemaVersion is below this is backed
// up once before the renderer migrates and overwrites it on the next save.
const SCHEMA_VERSION = 4

function backupStateBeforeMigration(raw: string): void {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    writeFileSync(join(stateDir(), `crafterm-state.backup-${ts}.json`), raw)
    // Keep only the most recent 5 backups.
    const dir = stateDir()
    const backups = readdirSync(dir)
      .filter((f) => f.startsWith('crafterm-state.backup-') && f.endsWith('.json'))
      .sort()
    for (const f of backups.slice(0, Math.max(0, backups.length - 5))) {
      try {
        unlinkSync(join(dir, f))
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore backup errors — never block startup */
  }
}

// Tiny JSON store (saved layout + theme) at <stateDir>/crafterm-state.json.
export function registerStoreIpc(): void {
  handle(Channel.Store.Load, () => {
    try {
      if (!existsSync(statePath())) return null
      const raw = readFileSync(statePath(), 'utf8')
      const data = JSON.parse(raw)
      if (data && typeof data === 'object' && data.schemaVersion !== SCHEMA_VERSION) {
        backupStateBeforeMigration(raw)
      }
      return data
    } catch {
      return null
    }
  })

  on(Channel.Store.Save, (data) => {
    try {
      mkdirSync(stateDir(), { recursive: true })
      // Atomic write: a hard kill mid-write would otherwise leave a truncated JSON
      // that fails to parse on next launch, losing every saved session.
      const tmp = statePath() + '.tmp'
      writeFileSync(tmp, JSON.stringify(data, null, 2))
      renameSync(tmp, statePath())
    } catch {
      /* ignore write errors */
    }
  })
}
