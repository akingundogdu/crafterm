import { el } from '@views/lib/dom'
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
  const row = el(
    'button',
    { class: 'pick-row gs-row' + (isActive ? ' active' : ''), onClick: onChoose },
    el('span', { class: 'spotlight-source-badge gs-' + e.source }, SOURCE_LABEL[e.source]),
    el('span', { class: 'spotlight-label' }, e.label),
    e.detail ? el('span', { class: 'spotlight-detail' }, e.detail) : null
  )
  row.addEventListener('mouseenter', onHover)
  return row
}
