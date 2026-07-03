import { Store } from '@geajs/core'
import type { MdFile } from './finders.types'

// Reactive state for the markdown / file finder pickers. The fields are the source
// of truth read directly in the finders view's template() so gea patches the list
// on every keystroke, filter-chip click, selection move and load — the board
// pattern (ssh.store). `rev` is bumped for a refresh the view didn't drive through
// one of the reactive fields. A single modal is open at a time, so one shared
// singleton store backs both finders; `reset()` clears it on each open.
class FindersStore extends Store {
  search = ''
  folderFilter: string | null = null // null = nothing loaded yet
  files: MdFile[] = []
  sel = 0
  loading = false
  rev = 0

  setSearch(search: string): void {
    this.search = search
  }

  setFilter(folderFilter: string | null): void {
    this.folderFilter = folderFilter
  }

  setFiles(files: MdFile[]): void {
    this.files = files
  }

  setSel(sel: number): void {
    this.sel = sel
  }

  setLoading(loading: boolean): void {
    this.loading = loading
  }

  bump(): void {
    this.rev++
  }

  reset(): void {
    this.search = ''
    this.folderFilter = null
    this.files = []
    this.sel = 0
    this.loading = false
  }
}

export default new FindersStore()
