import { join, dirname } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'fs'
import type { NbNode } from './notebook.types'
import { walk } from './notebook.utils'

// Notebook tree lives under <stateDir>/notebooks; `base` is resolved by the
// caller and passed in (matches scripts/secrets services). Every operation is
// confined to `base` via resolve()'s traversal guard.

// Resolve a relative notebook path safely inside the notebooks dir.
export function resolve(base: string, rel: string): string | null {
  const p = join(base, rel || '')
  if (p !== base && !p.startsWith(base + '/')) return null
  return p
}

export function tree(base: string): NbNode[] {
  return walk(base, base)
}

export function read(base: string, path: string): string {
  const p = resolve(base, path)
  if (!p || !existsSync(p)) return ''
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}

export function write(base: string, path: string, content: string): void {
  const p = resolve(base, path)
  if (!p) return
  try {
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content)
  } catch {
    /* ignore */
  }
}

export function mkdir(base: string, path: string): boolean {
  const p = resolve(base, path)
  if (!p) return false
  try {
    mkdirSync(p, { recursive: true })
    return true
  } catch {
    return false
  }
}

export function create(base: string, path: string): boolean {
  let rel = path
  if (!/\.(md|mdx|mdc)$/i.test(rel)) rel += '.md'
  const p = resolve(base, rel)
  if (!p) return false
  try {
    mkdirSync(dirname(p), { recursive: true })
    if (!existsSync(p)) writeFileSync(p, '')
    return true
  } catch {
    return false
  }
}

export function rename(base: string, path: string, name: string): boolean {
  const p = resolve(base, path)
  if (!p || !existsSync(p)) return false
  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  const np = resolve(base, parent ? `${parent}/${name}` : name)
  if (!np) return false
  try {
    renameSync(p, np)
    return true
  } catch {
    return false
  }
}

// Move a note/folder into another folder (drag-drop). `destDir` is the target
// directory relative path ('' = notebooks root). Rejects collisions and moving a
// folder into itself or a descendant.
export function move(base: string, src: string, destDir: string): boolean {
  const sp = resolve(base, src)
  if (!sp || !existsSync(sp)) return false
  const dDir = resolve(base, destDir)
  if (!dDir) return false
  if (dDir === sp || dDir.startsWith(sp + '/')) return false
  const name = src.includes('/') ? src.slice(src.lastIndexOf('/') + 1) : src
  const np = join(dDir, name)
  if (np === sp || existsSync(np)) return false
  try {
    mkdirSync(dDir, { recursive: true })
    renameSync(sp, np)
    return true
  } catch {
    return false
  }
}

export function del(base: string, path: string): boolean {
  const p = resolve(base, path)
  if (!p || p === base) return false
  try {
    rmSync(p, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}
