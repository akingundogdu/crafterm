import { readdirSync, type Dirent } from 'fs'
import { join } from 'path'
import type { NbNode } from './notebook.types'

export function walk(base: string, dir: string): NbNode[] {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: NbNode[] = []
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = join(dir, e.name)
    const rel = full.slice(base.length + 1)
    if (e.isDirectory()) out.push({ name: e.name, path: rel, kind: 'dir', children: walk(base, full) })
    else if (/\.(md|mdx|mdc)$/i.test(e.name)) out.push({ name: e.name, path: rel, kind: 'file' })
  }
  out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
  return out
}
