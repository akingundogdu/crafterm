import { describe, it, expect, beforeEach } from 'vitest'
import { chmodSync, existsSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs'
import { StoreService } from '@services/store/store.service'
import { stateDir, statePath } from '@core/services/paths/paths.service'
import type { SavedState } from '@repositories/state.types'

// The state blob holds DB + SSH passwords in the clear, so the file it is written to must
// never be readable by another account on the machine. (Tests run against a temp state dir
// — see src/tests/setup.ts.)

const store = new StoreService()
const saved = { schemaVersion: 4, tree: [] } as unknown as SavedState
const mode = (p: string): number => statSync(p).mode & 0o777

describe('StoreService.save file permissions', () => {
  beforeEach(() => {
    rmSync(statePath(), { force: true })
  })

  it('writes the state file owner-readable only', () => {
    store.save(saved)

    expect(existsSync(statePath())).toBe(true)
    expect(mode(statePath())).toBe(0o600)
    expect(mode(stateDir())).toBe(0o700)
  })

  it('tightens a state file left world-readable by an older build', () => {
    store.save(saved)
    chmodSync(statePath(), 0o644)
    chmodSync(stateDir(), 0o755)

    store.save(saved)

    expect(mode(statePath())).toBe(0o600)
    expect(mode(stateDir())).toBe(0o700)
  })

  it('round-trips the saved state', () => {
    store.save(saved)
    expect(store.load()).toEqual(saved)
  })

  it('does not leave the temp file behind', () => {
    store.save(saved)
    expect(existsSync(statePath() + '.tmp')).toBe(false)
  })

  it('writes the pre-migration backup owner-readable only', () => {
    writeFileSync(statePath(), JSON.stringify({ schemaVersion: 1 }), { mode: 0o644 })

    store.load()

    const dir = stateDir()
    const backup = readdirSync(dir).find((f) => f.startsWith('crafterm-state.backup-'))
    expect(backup).toBeTruthy()
    expect(mode(`${dir}/${backup}`)).toBe(0o600)
  })
})
