import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import type { FileRef } from './fs.types'

export function isFilePath(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

// Recursively list files under a root (for the notebook "Link file" finder).
export function walkFiles(dir: string, exclude: Set<string>, out: FileRef[], cap: number): void {
  if (out.length >= cap) return
  let entries: import('fs').Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (out.length >= cap) return
    if (e.name.startsWith('.') || exclude.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walkFiles(full, exclude, out, cap)
    else if (e.isFile()) out.push({ path: full, name: e.name })
  }
}
