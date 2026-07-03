import { Component } from '@geajs/core'
import type { GsEntry } from '../global-search.types'
import { SOURCE_LABEL } from '../global-search.state'

export interface GlobalSearchRowProps {
  entry: GsEntry
  isActive: boolean
  onChoose: () => void
  onHover: () => void
}

// One global-search result row: source badge + label + optional detail. Rendered
// as a JSX child of the list, so gea populates `this.props`. Selection index,
// activation, and hover-select stay in the parent, passed in as bound handlers.
// Self-contained — no @ui.
export default class GlobalSearchRow extends Component {
  declare props: GlobalSearchRowProps

  template({ entry, isActive, onChoose, onHover }: this['props']) {
    const e = entry
    return (
      <button
        class={'pick-row gs-row' + (isActive ? ' active' : '')}
        onClick={onChoose}
        onMouseEnter={onHover}
      >
        <span class={'spotlight-source-badge gs-' + e.source}>{SOURCE_LABEL[e.source]}</span>
        <span class="spotlight-label">{e.label}</span>
        {e.detail ? <span class="spotlight-detail">{e.detail}</span> : null}
      </button>
    )
  }
}
