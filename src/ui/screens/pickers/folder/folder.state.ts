import type { DirEntry } from '@services/fs/fs.types'
import { openTerminalInDir } from '@ui/commands/commands'

// Substring match on directory name (all when the query is blank).
export function filterDirs(dirs: DirEntry[], query: string): DirEntry[] {
  const q = query.trim().toLowerCase()
  return q ? dirs.filter((d) => d.name.toLowerCase().includes(q)) : dirs
}

// Row activation for the open-folder picker: open the dir in a new terminal,
// then close the picker.
export function makeOpenHere(close: () => void): (dir: string) => void {
  return (dir) => {
    void openTerminalInDir(dir)
    close()
  }
}
