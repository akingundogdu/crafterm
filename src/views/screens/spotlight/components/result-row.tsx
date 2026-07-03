import { Component } from '@geajs/core'
import type { SpotEntry } from './result-list.types'

export interface ResultRowProps {
  entry: SpotEntry
  index: number
  active: boolean
  showBadge: boolean
  badgeLabel: string
  onChoose: (e: SpotEntry) => void
  onHover: (index: number) => void
}

// A single `.spot-row`: optional source badge + label + optional detail. Rendered
// as a keyed JSX child of the result list, so gea populates `this.props`; the
// selection index and navigation stay in the controller/store, passed in as the
// active flag and bound handlers.
export default class ResultRow extends Component {
  declare props: ResultRowProps

  template({ entry, index, active, showBadge, badgeLabel, onChoose, onHover }: this['props']) {
    const e = entry
    return (
      <button
        class={'pick-row spot-row' + (active ? ' active' : '')}
        onClick={() => onChoose(e)}
        onMouseEnter={() => onHover(index)}
      >
        {showBadge ? <span class={'spotlight-source-badge gs-' + e.source}>{badgeLabel}</span> : null}
        <span class="spotlight-label">{e.label}</span>
        {e.detail ? <span class="spotlight-detail">{e.detail}</span> : null}
      </button>
    )
  }
}
