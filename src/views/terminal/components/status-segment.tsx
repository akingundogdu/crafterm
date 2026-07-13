import { Component } from '@geajs/core'
import type { StatusSegment } from '../status-bar.types'

// A single status segment span (tracking · branch · worktree · cwd). The branch
// segment is made clickable when a checkout handler is supplied, opening a
// searchable checkout picker.
class StatusSegmentView extends Component {
  private readonly s: StatusSegment
  private readonly clickHandler?: (e: Event) => void

  constructor(opts: { s: StatusSegment; onClick?: (e: Event) => void }) {
    super()
    this.s = opts.s
    this.clickHandler = opts.onClick
  }

  template() {
    const s = this.s
    const clickable = s.cls === 'branch' && !!this.clickHandler
    return (
      <span
        class={'pane-status-seg ' + s.cls + (clickable ? ' clickable' : '')}
        title={clickable ? 'Checkout branch…' : undefined}
        onClick={clickable ? this.clickHandler : undefined}
      >
        {s.text}
      </span>
    )
  }
}

export function createStatusSegment(s: StatusSegment, onClick?: (e: Event) => void): HTMLSpanElement {
  const host = document.createElement('div')
  new StatusSegmentView({ s, onClick }).render(host)
  return host.firstElementChild as HTMLSpanElement
}
