import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// Reversible stand-in for OS-backed safeStorage so set/get round-trips on disk
// without a live Electron app. `available` flips per-test to exercise guards.
let available = true
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => available,
    encryptString: (s: string) => Buffer.from('enc:' + s, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8').replace(/^enc:/, '')
  }
}))

import { setSecret, getSecret, deleteSecret, isSecretsAvailable } from '@core/services/secrets.service'

let baseDir: string

beforeEach(() => {
  available = true
  baseDir = mkdtempSync(join(tmpdir(), 'secrets-test-'))
})

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true })
})

describe('secrets.service', () => {
  it('round-trips a stored secret through encrypt/decrypt on disk', () => {
    expect(setSecret(baseDir, 'entry-1', 'token', 's3cr3t')).toEqual({ ok: true })
    expect(getSecret(baseDir, 'entry-1', 'token')).toBe('s3cr3t')
  })

  it('returns null for an unknown secret', () => {
    expect(getSecret(baseDir, 'missing', 'token')).toBeNull()
  })

  it('deletes a single key, leaving siblings intact', () => {
    setSecret(baseDir, 'entry-1', 'a', '1')
    setSecret(baseDir, 'entry-1', 'b', '2')
    expect(deleteSecret(baseDir, 'entry-1', 'a')).toEqual({ ok: true })
    expect(getSecret(baseDir, 'entry-1', 'a')).toBeNull()
    expect(getSecret(baseDir, 'entry-1', 'b')).toBe('2')
  })

  it('deletes the whole entry when no key is given', () => {
    setSecret(baseDir, 'entry-1', 'a', '1')
    setSecret(baseDir, 'entry-1', 'b', '2')
    expect(deleteSecret(baseDir, 'entry-1')).toEqual({ ok: true })
    expect(existsSync(join(baseDir, 'entry-1'))).toBe(false)
  })

  it('rejects ids/keys that sanitize to empty', () => {
    const res = setSecret(baseDir, '', 'token', 'x')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('invalid id/key')
  })

  it('sanitizes unsafe id/key characters into a flat filename', () => {
    expect(setSecret(baseDir, '../evil id', 'a/b key', 'v')).toEqual({ ok: true })
    expect(getSecret(baseDir, '../evil id', 'a/b key')).toBe('v')
  })

  it('reports unavailable encryption instead of writing plaintext', () => {
    available = false
    expect(setSecret(baseDir, 'e', 'k', 'v')).toEqual({ ok: false, error: 'safeStorage unavailable' })
    expect(getSecret(baseDir, 'e', 'k')).toBeNull()
    expect(isSecretsAvailable()).toBe(false)
  })
})
