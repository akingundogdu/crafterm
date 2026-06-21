import type { LineRow } from '../line-select.types'

interface DiffRowOptions {
  desc: LineRow
  // Wired only for selectable rows (desc.line != null), with the row's index.
  onMouseDown?: (e: MouseEvent) => void
  onMouseEnter?: () => void
}

// A single gutter+text row in the read-only diff/file body. Pure view: builds the
// row and (for selectable rows) sets `dataset.line` and wires the injected
// mousedown/mouseenter handlers the selection engine drives.
export function createDiffRow(opts: DiffRowOptions): HTMLDivElement {
  const { desc } = opts
  const row = (
    <div class={desc.className}>
      <span class="diff-gutter" ref={(el: HTMLSpanElement) => (el.textContent = desc.gutter)} />
      <span class="diff-text" ref={(el: HTMLSpanElement) => (el.textContent = desc.text)} />
    </div>
  ) as HTMLDivElement
  if (desc.line != null) {
    row.dataset.line = String(desc.line)
    if (opts.onMouseDown) row.addEventListener('mousedown', opts.onMouseDown)
    if (opts.onMouseEnter) row.addEventListener('mouseenter', opts.onMouseEnter)
  }
  return row
}
