import type { FileDiff } from '../parse-diff'

interface SearchItemOptions {
  file: FileDiff
  active: boolean
  onPick: (e: Event) => void
}

// A single file-match row in the diff search dropdown. Pure view — highlights the
// active file and forwards the (mousedown) pick to the injected handler.
export function createSearchItem(opts: SearchItemOptions): HTMLDivElement {
  const item = (
    <div
      class={'diff-search-item' + (opts.active ? ' active' : '')}
      title={opts.file.path}
      onMouseDown={opts.onPick}
    >
      {opts.file.path}
    </div>
  ) as HTMLDivElement
  return item
}
