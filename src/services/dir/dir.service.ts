import { join } from 'path'
import { homedir } from 'os'
import { readdirSync } from 'fs'
import type { DirListing } from './dir.types'

// Directory-listing domain logic (dir:*): one-level sub-directory listing for the
// Cmd+P folder picker. No IPC wiring (that's DirController in dir.main.ts).
export class DirService {
  // List sub-directories of a path (for the Cmd+P folder picker). Empty -> home.
  list(path?: string): DirListing {
    let dir = path && path.trim() ? path.trim() : homedir()
    if (dir.startsWith('~')) dir = join(homedir(), dir.slice(1))
    try {
      const dirs = readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
        .map((d) => ({ name: d.name, path: join(dir, d.name) }))
        .sort((a, b) => a.name.localeCompare(b.name))
      const parent = join(dir, '..')
      return { path: dir, parent: parent === dir ? null : parent, dirs }
    } catch {
      return { path: dir, parent: null, dirs: [] }
    }
  }
}
