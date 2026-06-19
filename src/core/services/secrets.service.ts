import { safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, unlinkSync } from 'fs'

// safeStorage-encrypted blobs stored under <baseDir>/<id>/<key>.bin (baseDir is
// <stateDir>/secrets, resolved by the caller). The JSON state file only
// references the (id, key) pair; the secret value itself never lives in
// plaintext on disk. macOS uses Keychain under the hood.

export interface SecretResult {
  ok: boolean
  error?: string
}

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)
}

function secretFilePath(baseDir: string, entryId: string, key: string): string | null {
  const id = safeName(entryId)
  const k = safeName(key)
  if (!id || !k) return null
  return join(baseDir, id, k + '.bin')
}

export function isSecretsAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function setSecret(
  baseDir: string,
  entryId: string,
  key: string,
  value: string
): SecretResult {
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'safeStorage unavailable' }
  const p = secretFilePath(baseDir, entryId, key)
  if (!p) return { ok: false, error: 'invalid id/key' }
  try {
    mkdirSync(join(p, '..'), { recursive: true })
    const enc = safeStorage.encryptString(value ?? '')
    writeFileSync(p, enc)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String((err as Error).message) }
  }
}

export function getSecret(baseDir: string, entryId: string, key: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  const p = secretFilePath(baseDir, entryId, key)
  if (!p || !existsSync(p)) return null
  try {
    return safeStorage.decryptString(readFileSync(p))
  } catch {
    return null
  }
}

export function deleteSecret(baseDir: string, entryId: string, key?: string): SecretResult {
  try {
    const dir = join(baseDir, safeName(entryId))
    if (!key) {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
      return { ok: true }
    }
    const p = secretFilePath(baseDir, entryId, key)
    if (p && existsSync(p)) unlinkSync(p)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String((err as Error).message) }
  }
}
