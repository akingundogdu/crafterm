import { readFileSync, existsSync } from 'fs'
import { statePath } from '../paths/paths.service'

// The global `defaultShell` setting lives in the renderer-owned
// crafterm-state.json; read it from disk (briefly cached, since spawns are
// user-initiated and infrequent) so main needs no renderer round-trip.
let cache: { value: string | undefined; at: number } | null = null
const TTL_MS = 3000

export function readDefaultShell(): string | undefined {
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) return cache.value
  let value: string | undefined
  try {
    if (existsSync(statePath())) {
      const parsed = JSON.parse(readFileSync(statePath(), 'utf8')) as { defaultShell?: unknown }
      if (typeof parsed.defaultShell === 'string' && parsed.defaultShell.trim()) {
        value = parsed.defaultShell.trim()
      }
    }
  } catch {
    value = undefined
  }
  cache = { value, at: now }
  return value
}
