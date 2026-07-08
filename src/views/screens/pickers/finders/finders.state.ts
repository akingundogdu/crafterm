import { settings } from '@views/state/spine'
import { fsService, markdownService } from '@services'
import type { MdFile } from './finders.types'
import store from './finders.store'

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
