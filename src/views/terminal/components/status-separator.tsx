import { Component } from '@geajs/core'

// Middle-dot separator placed between adjacent status segments.
class StatusSeparatorView extends Component {
  template() {
    return <span class="pane-status-sep">·</span>
  }
}

export function createStatusSeparator(): HTMLSpanElement {
  const host = document.createElement('div')
  new StatusSeparatorView().render(host)
  return host.firstElementChild as HTMLSpanElement
}
