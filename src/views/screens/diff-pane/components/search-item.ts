import { el } from '@views/lib/dom'
import type { FileDiff } from '../parse-diff'

interface SearchItemOptions {
  file: FileDiff
  active: boolean
  onPick: (e: Event) => void
}

// A single file-match row in the diff search dropdown. Pure view — highlights the
// active file and forwards the (mousedown) pick to the injected handler. Plain-DOM
// (el()) port of the legacy JSX factory (§2.7 self-contained, no @ui).
export function createSearchItem(opts: SearchItemOptions): HTMLDivElement {
  return el(
    'div',
    {
      class: 'diff-search-item' + (opts.active ? ' active' : ''),
      title: opts.file.path,
      onMouseDown: opts.onPick
    },
    opts.file.path
  )
}
