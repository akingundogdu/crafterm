import type { SpotEntry, SpotSource } from './result-list.types'
import { makeRowChoose } from './result-list.state'

// A single `.spot-row`: optional source badge + label + optional detail. The
// badge resolver and choose/hover handlers are injected so the row pulls no
// business/IPC modules.
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
  return (
    <button
      class={'pick-row spot-row' + (selected ? ' active' : '')}
      onClick={makeRowChoose(onChoose, entry)}
      onMouseEnter={() => onHover(index)}
    >
      {showBadge && <span class={'spotlight-source-badge gs-' + entry.source}>{badgeFor(entry.source)}</span>}
      <span class="spotlight-label">{entry.label}</span>
      {entry.detail && <span class="spotlight-detail">{entry.detail}</span>}
    </button>
  ) as HTMLButtonElement
}
