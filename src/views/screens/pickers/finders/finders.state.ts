import type { MdFile } from './finders.types'

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
