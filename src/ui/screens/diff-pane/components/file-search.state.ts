import type { FileDiff } from '../parse-diff'

// Filtered (file, original-index) pairs whose path contains the query substring.
export function filterFiles(files: FileDiff[], query: string): { f: FileDiff; i: number }[] {
  const q = query.trim().toLowerCase()
  return files
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !q || f.path.toLowerCase().includes(q))
}

// Index of the first file matching the query, or -1.
export function firstMatch(files: FileDiff[], query: string): number {
  const q = query.trim().toLowerCase()
  return files.findIndex((f) => !q || f.path.toLowerCase().includes(q))
}

// Sets the spellcheck property (not just the attribute) so it reflects on `.spellcheck`.
export function disableSpellcheck(el: HTMLInputElement): void {
  el.spellcheck = false
}

// mousedown handler for a result row: keep focus, close, then jump to the file.
export function makeItemPick(i: number, close: () => void, onPick: (idx: number) => void): (e: Event) => void {
  return (e) => {
    e.preventDefault()
    close()
    onPick(i)
  }
}

// keydown handler: Escape closes; Enter jumps to the first match.
export function makeSearchKeydown(
  input: HTMLInputElement,
  getFiles: () => FileDiff[],
  close: () => void,
  onPick: (idx: number) => void
): (e: KeyboardEvent) => void {
  return (e) => {
    if (e.key === 'Escape') {
      close()
      return
    }
    if (e.key === 'Enter') {
      const first = firstMatch(getFiles(), input.value)
      if (first >= 0) {
        close()
        onPick(first)
      }
    }
  }
}
