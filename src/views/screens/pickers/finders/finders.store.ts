import { Store } from '@geajs/core'
import { settings } from '@views/state/spine'
import { fsService, markdownService } from '@services'
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

const store = new FindersStore()
export default store

// Sentinel folder value for the "All configured folders" chip.
export const ALL_FOLDERS = ' all'

// Collapses an absolute home path to `~` for display.
export function prettyPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, '~')
}

// Case-insensitive "name contains" filter; an empty query returns all files.
export function filterByName(files: MdFile[], query: string): MdFile[] {
  const q = query.trim().toLowerCase()
  return q ? files.filter((f) => f.name.toLowerCase().includes(q)) : files
}

// Dedupes file lists from several folders by path, keeping the first occurrence.
export function dedupeByPath(lists: MdFile[][]): MdFile[] {
  const byPath = new Map<string, MdFile>()
  for (const list of lists) for (const f of list) byPath.set(f.path, f)
  return [...byPath.values()]
}

// "N files" / "1 file" count label.
export function fileCountLabel(n: number): string {
  return `${n} file${n === 1 ? '' : 's'}`
}

// Fetch markdown for the clicked folder — or, for "All", every configured folder —
// driving the shared finders store through the load lifecycle.
export async function loadMarkdown(folders: string[], value: string): Promise<void> {
  store.setFilter(value)
  store.setFiles([])
  store.setLoading(true)
  store.setSel(0)
  if (value === ALL_FOLDERS) {
    const results = await Promise.all(folders.map((f) => markdownService.findAll(f)))
    store.setFiles(dedupeByPath(results.map((r) => r.files)))
  } else {
    const res = await markdownService.findAll(value)
    store.setFiles(res.files)
  }
  store.setLoading(false)
  store.setSel(0)
}

// Fetch any file under the clicked folder — or, for "All", every configured folder.
export async function loadFiles(folders: string[], value: string): Promise<void> {
  store.setFilter(value)
  store.setFiles([])
  store.setLoading(true)
  store.setSel(0)
  if (value === ALL_FOLDERS) {
    const results = await Promise.all(folders.map((f) => fsService.findFiles(f, settings.explorerExclude)))
    store.setFiles(dedupeByPath(results.map((r) => r.files)))
  } else {
    const res = await fsService.findFiles(value, settings.explorerExclude)
    store.setFiles(res.files)
  }
  store.setLoading(false)
  store.setSel(0)
}
