import { el } from '@views/lib/dom'
import type { LineRow } from '../line-select.types'

interface DiffRowOptions {
  desc: LineRow
  // Wired only for selectable rows (desc.line != null), with the row's index.
  onMouseDown?: (e: MouseEvent) => void
  onMouseEnter?: () => void
}

// A single gutter+text row in the read-only diff/file body. Pure view: builds the
// row and (for selectable rows) sets `dataset.line` and wires the injected
// mousedown/mouseenter handlers the selection engine drives. Plain-DOM (el())
// port of the legacy JSX factory (§2.7 self-contained, no @ui).
export function createDiffRow(opts: DiffRowOptions): HTMLDivElement {
  const { desc } = opts
  const gutter = el('span', { class: 'diff-gutter' })
  gutter.textContent = desc.gutter
  const text = el('span', { class: 'diff-text' })
  text.textContent = desc.text
  const row = el('div', { class: desc.className }, gutter, text)
  if (desc.line != null) {
    row.dataset.line = String(desc.line)
    if (opts.onMouseDown) row.addEventListener('mousedown', opts.onMouseDown as EventListener)
    if (opts.onMouseEnter) row.addEventListener('mouseenter', opts.onMouseEnter)
  }
  return row
}
