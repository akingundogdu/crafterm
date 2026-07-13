import { Component } from '@geajs/core'

export interface PoppedOutPlaceholderProps {
  title: string
  onFocusClick: (e: MouseEvent) => void
}

// A pane shown in a separate pop-out window leaves this placeholder behind.
// Static gea markup; the factory returns the raw node so consumers can drop it
// into the content area unchanged.
class PoppedOutPlaceholder extends Component {
  private readonly opts: PoppedOutPlaceholderProps

  constructor(opts: PoppedOutPlaceholderProps) {
    super()
    this.opts = opts
  }

  template() {
    return (
      <div class="pane-box pane-popped">
        <div class="pane-popped-inner">
          <div class="pane-popped-label">{this.opts.title + ' is open in a separate window'}</div>
          <button class="settings-inline-btn" onClick={this.opts.onFocusClick}>
            Focus window
          </button>
        </div>
      </div>
    )
  }
}

export function buildPoppedOutPlaceholder(props: PoppedOutPlaceholderProps): HTMLElement {
  const host = document.createElement('div')
  new PoppedOutPlaceholder(props).render(host)
  return host.firstElementChild as HTMLElement
}
