import type { LineRow } from '../line-select.types'

interface DiffRowOptions {
  desc: LineRow
  // Wired only for selectable rows (desc.line != null), with the row's index.
  onMouseDown?: (e: MouseEvent) => void
  onMouseEnter?: () => void
}

// A single gutter+text row in the read-only diff/file body. Built with plain DOM:
// `setRows` creates these in a tight loop (one per file line), and gea's imperative
// `new View().render(host)` batches/defers renders when many fire synchronously in
// a loop (the host is still empty when `firstElementChild` is read). A per-row list
// item is therefore built directly — this is the diff-body's hot path, not a
// reactive view. (Static structure; class/gutter/text come from the LineRow.)
export function createDiffRow(opts: DiffRowOptions): HTMLDivElement {
  const { desc } = opts
  const row = document.createElement('div')
  row.className = desc.className

  const gutter = document.createElement('span')
  gutter.className = 'diff-gutter'
  gutter.textContent = desc.gutter
  const text = document.createElement('span')
  text.className = 'diff-text'
  text.textContent = desc.text
  row.append(gutter, text)

  if (desc.line != null) {
    row.dataset.line = String(desc.line)
    if (opts.onMouseDown) row.addEventListener('mousedown', opts.onMouseDown as EventListener)
    if (opts.onMouseEnter) row.addEventListener('mouseenter', opts.onMouseEnter)
  }
  return row
}
