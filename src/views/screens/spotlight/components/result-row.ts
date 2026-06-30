import { el } from '@views/lib/dom'
import type { SpotEntry, SpotSource } from './result-list.types'
import { makeRowChoose } from './result-list.state'

// A single `.spot-row`: optional source badge + label + optional detail. The
// badge resolver and choose/hover handlers are injected so the row pulls no
// business/IPC modules. Plain-DOM `el()` (gea §5) — no JSX, no @ui runtime.
export function createResultRow(opts: {
  entry: SpotEntry
  index: number
  selected: boolean
  showBadge: boolean
  badgeFor: (source: SpotSource) => string
  onChoose: (e: SpotEntry) => void
  onHover: (index: number) => void
}): HTMLButtonElement {
  const { entry, index, selected, showBadge, badgeFor, onChoose, onHover } = opts
  return el(
    'button',
    {
      class: 'pick-row spot-row' + (selected ? ' active' : ''),
      onClick: makeRowChoose(onChoose, entry),
      onMouseEnter: () => onHover(index)
    },
    showBadge && el('span', { class: 'spotlight-source-badge gs-' + entry.source }, badgeFor(entry.source)),
    el('span', { class: 'spotlight-label' }, entry.label),
    entry.detail && el('span', { class: 'spotlight-detail' }, entry.detail)
  )
}
