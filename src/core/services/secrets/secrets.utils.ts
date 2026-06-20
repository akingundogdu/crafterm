import { join } from 'path'

export function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)
}

export function secretFilePath(baseDir: string, entryId: string, key: string): string | null {
  const id = safeName(entryId)
  const k = safeName(key)
  if (!id || !k) return null
  return join(baseDir, id, k + '.bin')
}
