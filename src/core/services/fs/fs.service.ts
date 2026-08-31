import { shell } from 'electron'
import { join, dirname, resolve as resolvePath } from 'path'
import { homedir } from 'os'
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import type { DirEntry, FileRef, ReadTextResult } from './fs.types'
import { isFilePath, walkFiles } from './fs.utils'
import { pastedImagesDir } from '../paths/paths.service'

// Filesystem operations backing the Files tree, code editor, and finders. All
// callers pass absolute paths (with optional ~ expansion), so there is no base
// dir to confine to — these are deliberate, user-driven file actions.

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

// An image pasted into the agent composer. The renderer has no filesystem, so it
// hands the bitmap over as base64 and this writes it out under the pasted-images
// temp dir, returning the absolute path the prompt then refers to.
//
// The composer names its images itself (image-1, image-2, …) so the prompt can say
// "in image-2 …" and Claude knows which file that is. Those names repeat with every
// new ticket, so each composer batch gets its own subdirectory — a still-running
// session's image-1 is never overwritten by the next one's. `name` and `batch` are
// stripped to [a-z0-9-] here (and `ext` to a short token): they end up in a path, so
// nothing that could climb out of the dir is trusted through.
// Oversized payloads are dropped — a paste is not a file-transfer channel.
const PASTED_IMAGE_MAX_BYTES = 25 * 1024 * 1024
const SAFE_EXT = /^[a-z0-9]{1,5}$/

export function writePastedImage(data: string, ext: string, name: string, batch: string): string | null {
  try {
    const bytes = Buffer.from(data, 'base64')
    if (!bytes.length || bytes.length > PASTED_IMAGE_MAX_BYTES) return null
    const dir = join(pastedImagesDir(), safeToken(batch, 'batch'))
    mkdirSync(dir, { recursive: true })
    const path = join(dir, `${safeToken(name, 'image')}.${SAFE_EXT.test(ext) ? ext : 'png'}`)
    writeFileSync(path, bytes)
    return path
  } catch {
    return null
  }
}

// A path segment that cannot be anything but a plain name: everything outside
// [a-z0-9-] is dropped (so are '.' and '/'), and an empty result takes the fallback.
function safeToken(raw: string, fallback: string): string {
  const token = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+/, '')
    .slice(0, 64)
  return token || fallback
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

export function findFiles(root?: string, exclude?: string[]): { root: string; files: FileRef[] } {
  let dir = root && root.trim() ? root.trim() : homedir()
  if (dir.startsWith('~')) dir = join(homedir(), dir.slice(1))
  if (!existsSync(dir)) return { root: dir, files: [] }
  const out: FileRef[] = []
  walkFiles(dir, new Set(exclude ?? ['node_modules', '.git', 'dist', 'out']), out, 20000)
  return { root: dir, files: out }
}
