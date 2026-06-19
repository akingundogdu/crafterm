import { handle, Channel } from '@services/channels.main'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync, readdirSync } from 'fs'

// Find markdown files under `root` by walking the tree (works for dot-folders
// like ~/.claude, which Spotlight/mdfind does not index).
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

// Markdown finder bridge (md:*): recursively list .md files for the Cmd+O finder.
export function registerMdIpc(): void {
  handle(Channel.Md.FindAll, ({ root }) => {
    let dir = root && root.trim() ? root.trim() : homedir()
    if (dir.startsWith('~')) dir = join(homedir(), dir.slice(1))
    if (!existsSync(dir)) dir = homedir()
    const paths: string[] = []
    walkMd(dir, paths, 8000)
    const files = paths.map((p) => ({ path: p, name: p.split('/').pop() || p }))
    return { root: dir, files }
  })
}
