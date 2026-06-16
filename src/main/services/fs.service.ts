import { shell } from 'electron'
import { join, dirname, resolve as resolvePath } from 'path'
import { homedir } from 'os'
import {
  readdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  statSync
} from 'fs'

// Filesystem operations backing the Files tree, code editor, and finders. All
// callers pass absolute paths (with optional ~ expansion), so there is no base
// dir to confine to — these are deliberate, user-driven file actions.

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

export interface FileRef {
  path: string
  name: string
}

function isFilePath(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

export function listEntries(path?: string): { path: string; entries: DirEntry[] } {
  let dir = path && path.trim() ? path.trim() : homedir()
  if (dir.startsWith('~')) dir = join(homedir(), dir.slice(1))
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
      .map((d) => ({ name: d.name, path: join(dir, d.name), isDir: d.isDirectory() }))
      .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
    return { path: dir, entries }
  } catch {
    return { path: dir, entries: [] }
  }
}

export function readMd(path: string): string {
  if (!/\.(md|mdx|mdc)$/i.test(path) || !existsSync(path)) return ''
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

export type ReadTextResult = { ok: true; text: string } | { ok: false; error: string }

// Caps size and rejects binary content so the file viewer pane never tries to
// render a multi-megabyte blob or garbage.
export function readText(path: string): ReadTextResult {
  try {
    if (!existsSync(path)) return { ok: false, error: 'File not found.' }
    const buf = readFileSync(path)
    if (buf.length > 2_000_000) return { ok: false, error: 'File too large to preview.' }
    if (buf.includes(0)) return { ok: false, error: 'Binary file — cannot preview.' }
    return { ok: true, text: buf.toString('utf8') }
  } catch {
    return { ok: false, error: 'Failed to read file.' }
  }
}

export function writeMd(path: string, content: string): boolean {
  if (!/\.(md|mdx|mdc)$/i.test(path)) return false
  try {
    writeFileSync(path, content)
    return true
  } catch {
    return false
  }
}

// Only overwrites an existing regular file — never creates new paths here, so a
// bad path can't scatter files.
export function writeText(path: string, content: string): boolean {
  try {
    if (!isFilePath(path)) return false
    writeFileSync(path, content, 'utf8')
    return true
  } catch {
    return false
  }
}

// Resolve a relative import specifier to an absolute source file (go-to-
// definition for imports). Probes the common TS/JS extensions + index files.
// When `symbol` is given, scans the target for its declaration line. Returns
// null for bare/node_modules specifiers or anything that doesn't exist.
const IMPORT_EXTS = ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '.mjs', '.cjs', '.json', '.vue', '.svelte']
export function resolveImport(
  fromFile: string,
  spec: string,
  symbol?: string
): { path: string; line: number } | null {
  if (!fromFile || !spec) return null
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null // bare module — skip
  const base = spec.startsWith('/') ? spec : resolvePath(dirname(fromFile), spec)
  const candidates: string[] = []
  if (/\.[a-z0-9]+$/i.test(base) && isFilePath(base)) candidates.push(base)
  for (const ext of IMPORT_EXTS) candidates.push(base + ext)
  for (const ext of IMPORT_EXTS) candidates.push(join(base, 'index' + ext))
  const target = candidates.find((c) => isFilePath(c))
  if (!target) return null
  let line = 1
  if (symbol && /^[A-Za-z_$][\w$]*$/.test(symbol)) {
    try {
      const src = readFileSync(target, 'utf8').split('\n')
      const re = new RegExp(
        `\\b(?:export\\s+)?(?:default\\s+)?(?:abstract\\s+)?(?:class|interface|type|enum|function|const|let|var)\\s+${symbol}\\b`
      )
      const idx = src.findIndex((l) => re.test(l))
      if (idx >= 0) line = idx + 1
    } catch {
      // fall back to line 1
    }
  }
  return { path: target, line }
}

// Refuses to overwrite an existing path.
export function createFile(path: string): boolean {
  try {
    if (existsSync(path)) return false
    writeFileSync(path, '', { flag: 'wx' })
    return true
  } catch {
    return false
  }
}

// Refuses an existing path.
export function mkdir(path: string): boolean {
  try {
    if (existsSync(path)) return false
    mkdirSync(path)
    return true
  } catch {
    return false
  }
}

// Refuses if the destination exists.
export function rename(from: string, to: string): boolean {
  try {
    if (!existsSync(from) || existsSync(to)) return false
    renameSync(from, to)
    return true
  } catch {
    return false
  }
}

// Move a path to the system Trash. Recoverable, unlike rm.
export async function trash(path: string): Promise<boolean> {
  try {
    if (!existsSync(path)) return false
    await shell.trashItem(path)
    return true
  } catch {
    return false
  }
}

// Resolve a path clicked in the terminal to an existing file. Terminal output
// often prints paths relative to a directory that isn't the pane's exact cwd
// (e.g. "pkg/docs/x.md" while the cwd is already inside "pkg", which would
// otherwise resolve to "pkg/pkg/docs/x.md" and 404). Try the path against the
// cwd and each ancestor directory, returning the first one that exists.
export function resolveFile(base: string | undefined, rel: string): string | null {
  let target = (rel || '').trim()
  if (!target) return null
  if (target.startsWith('~')) target = join(homedir(), target.slice(1))
  if (target.startsWith('/')) return isFilePath(target) ? target : null
  target = target.replace(/^\.\//, '')
  const candidates: string[] = []
  let dir = base && base.trim() ? base.trim() : homedir()
  for (let i = 0; i < 12; i++) {
    candidates.push(join(dir, target))
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  candidates.push(join(homedir(), target))
  for (const c of candidates) if (isFilePath(c)) return c
  return null
}

// Recursively list files under a root (for the notebook "Link file" finder).
function walkFiles(dir: string, exclude: Set<string>, out: FileRef[], cap: number): void {
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

export function findFiles(root?: string, exclude?: string[]): { root: string; files: FileRef[] } {
  let dir = root && root.trim() ? root.trim() : homedir()
  if (dir.startsWith('~')) dir = join(homedir(), dir.slice(1))
  if (!existsSync(dir)) return { root: dir, files: [] }
  const out: FileRef[] = []
  walkFiles(dir, new Set(exclude ?? ['node_modules', '.git', 'dist', 'out']), out, 20000)
  return { root: dir, files: out }
}
