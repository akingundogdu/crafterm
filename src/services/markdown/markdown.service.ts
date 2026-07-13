import { join } from 'path'
import { homedir } from 'os'
import { execFile } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { loadScript } from '@core/services/scripts/scripts.service'
import { runtimeDir } from '@core/services/paths/paths.service'
import { shq } from '@core/services/exec/exec.service'
import { resolveShell } from '@core/services/shell-resolver/shell-resolver.service'

// Find markdown files under `root` by walking the tree (works for dot-folders like
// ~/.claude, which Spotlight/mdfind does not index).
const MD_SKIP = new Set(['node_modules', '.git', '.Trash', '.cache'])
function walkMd(dir: string, acc: string[], limit: number): void {
  if (acc.length >= limit) return
  let entries: import('fs').Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (acc.length >= limit) return
    if (e.isSymbolicLink()) continue
    if (e.isDirectory()) {
      if (!MD_SKIP.has(e.name)) walkMd(join(dir, e.name), acc, limit)
    } else if (/\.(md|mdx|mdc)$/i.test(e.name)) {
      acc.push(join(dir, e.name))
    }
  }
}

// Markdown domain logic (markdown:*): open a file in the user's Markdown app, and
// the recursive .md finder for the Cmd+O picker. No IPC wiring (see markdown.main.ts).
export class MarkdownService {
  // Open a file in the user's Markdown app via their `markdown` (mdpp) command.
  open(path: string): void {
    execFile(
      resolveShell(),
      ['-lic', loadScript(join(runtimeDir(), 'templates'), 'markdown-open.sh.tmpl', { path: shq(path) })],
      () => {}
    )
  }

  // Recursively list .md/.mdx/.mdc files under `root` (defaults to home).
  findAll(root?: string): { root: string; files: { path: string; name: string }[] } {
    let dir = root && root.trim() ? root.trim() : homedir()
    if (dir.startsWith('~')) dir = join(homedir(), dir.slice(1))
    if (!existsSync(dir)) dir = homedir()
    const paths: string[] = []
    walkMd(dir, paths, 8000)
    const files = paths.map((p) => ({ path: p, name: p.split('/').pop() || p }))
    return { root: dir, files }
  }
}
