import type { GsEntry } from '../global-search.types'
import { SOURCE_LABEL } from '../global-search.state'

interface GlobalSearchRowProps {
  entry: GsEntry
  isActive: boolean
  onChoose: () => void
  onHover: () => void
}

// One global-search result row: source badge + label + optional detail. Pure
// factory — selection index, highlight, and activation stay in the parent,
// passed in as callbacks.
export function globalSearchRow({
  entry,
  isActive,
  onChoose,
  onHover
}: GlobalSearchRowProps): HTMLButtonElement {
  const e = entry
  const row = (
    <button class={'pick-row gs-row' + (isActive ? ' active' : '')} onClick={onChoose}>
      <span class={'spotlight-source-badge gs-' + e.source}>{SOURCE_LABEL[e.source]}</span>
      <span class="spotlight-label">{e.label}</span>
      {e.detail && <span class="spotlight-detail">{e.detail}</span>}
    </button>
  ) as HTMLButtonElement
  row.addEventListener('mouseenter', onHover)
  return row
}
