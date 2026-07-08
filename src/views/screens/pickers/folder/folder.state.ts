import type { DirEntry } from '@services/fs/fs.types'
import { openTerminalInDir } from '@views/commands/commands'
import { dirService } from '@services'
import store from './folder.store'

// Substring match on directory name (all when the query is blank).
export function filterDirs(dirs: DirEntry[], query: string): DirEntry[] {
  const q = query.trim().toLowerCase()
  return q ? dirs.filter((d) => d.name.toLowerCase().includes(q)) : dirs
}

// List a directory and push its path, entries, and drill-up parent into the store,
// which re-renders the reactive list. Shared by both folder pickers.
export async function loadFolderListing(p?: string): Promise<void> {
  const listing = await dirService.list(p)
  store.setListing(listing.path, listing.dirs, listing.parent)
}

// Row activation for the open-folder picker: open the dir in a new terminal,
// then close the picker.
export function makeOpenHere(close: () => void): (dir: string) => void {
  return (dir) => {
    void openTerminalInDir(dir)
    close()
  }
}
