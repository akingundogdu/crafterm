import { Store } from '@geajs/core'
import type { DirEntry } from '@services/fs/fs.types'
import { openTerminalInDir } from '@views/commands/commands'
import { dirService } from '@services'

// Reactive state for the folder pickers (both the "pick a folder" and the Cmd+P
// "browse & open" variants share this singleton — only one picker modal is ever
// open at a time). `path` / `search` / `dirs` / `sel` are the source of truth read
// directly in the list view's template() so gea patches the list on every search
// keystroke, directory load, or selection change (arrow-key nav / hover) — the
// board pattern. `parent` holds the drill-up target for the current listing (read
// by the entry fn's ArrowLeft nav). `rev` is bumped alongside each mutation to
// force the refresh.
class FolderStore extends Store {
  path = ''
  search = ''
  dirs: DirEntry[] = []
  sel = 0
  parent: string | null = null
  rev = 0

  reset(): void {
    this.path = ''
    this.search = ''
    this.dirs = []
    this.sel = 0
    this.parent = null
    this.rev++
  }

  setListing(path: string, dirs: DirEntry[], parent: string | null): void {
    this.path = path
    this.dirs = dirs
    this.parent = parent
    this.search = ''
    this.sel = 0
    this.rev++
  }

  setSearch(search: string): void {
    this.search = search
    this.sel = 0
    this.rev++
  }

  setSel(sel: number): void {
    this.sel = sel
    this.rev++
  }
}

const store = new FolderStore()
export default store

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
