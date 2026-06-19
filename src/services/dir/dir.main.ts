import { handle } from '@services/channels.main'
import { join } from 'path'
import { homedir } from 'os'
import { readdirSync } from 'fs'

// Directory bridge (dir:*): list sub-directories for the Cmd+P folder picker.
export function registerDirIpc(): void {
  // List sub-directories of a path (for the Cmd+P folder picker). Empty -> home.
  handle('dir:list', ({ path }) => {
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
  })
}
