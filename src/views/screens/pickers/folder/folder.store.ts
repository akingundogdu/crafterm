import { Store } from '@geajs/core'
import type { DirEntry } from '@services/fs/fs.types'

// Reactive state for the folder pickers (both the "pick a folder" and the Cmd+P
// "browse & open" variants share this singleton — only one picker modal is ever
// open at a time). `path` / `search` / `dirs` / `sel` are the source of truth read
// directly in the list view's template() so gea patches the list on every search
// keystroke, directory load, or selection change (arrow-key nav / hover) — the
// board pattern. `rev` is bumped alongside each mutation to force the refresh.
class FolderStore extends Store {
  path = ''
  search = ''
  dirs: DirEntry[] = []
  sel = 0
  rev = 0

  reset(): void {
    this.path = ''
    this.search = ''
    this.dirs = []
    this.sel = 0
    this.rev++
  }

  setListing(path: string, dirs: DirEntry[]): void {
    this.path = path
    this.dirs = dirs
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

export default new FolderStore()
