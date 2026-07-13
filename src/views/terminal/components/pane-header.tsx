import { Component } from '@geajs/core'
import { UITexts } from '@texts'

export interface PaneHeaderProps {
  onTaskChipClick: (e: MouseEvent) => void
  onMenuClick: (e: MouseEvent) => void
  onCloseClick: (e: MouseEvent) => void
}

export interface PaneHeader {
  header: HTMLDivElement
  htitle: HTMLSpanElement
}

// The terminal pane's header: title + daily-task chip (hidden until assigned) +
// options menu + close. Mounted imperatively, so props arrive via the constructor.
class PaneHeaderView extends Component {
  private readonly headerProps: PaneHeaderProps

  constructor(opts: { props: PaneHeaderProps }) {
    super()
    this.headerProps = opts.props
  }

  template() {
    const p = this.headerProps
    return (
      <div class="pane-header">
        <span class="pane-title">zsh</span>
        <button
          class="pane-daily-chip"
          style={{ display: 'none' }}
          title={UITexts.Terminal.dailyTicket}
          onClick={p.onTaskChipClick}
        />
        <button class="pane-btn" title={UITexts.Terminal.paneOptions} onClick={p.onMenuClick}>
          ⋯
        </button>
        <button class="pane-close" onClick={p.onCloseClick}>
          ×
        </button>
      </div>
    )
  }
}

export function createPaneHeader(props: PaneHeaderProps): PaneHeader {
  const host = document.createElement('div')
  new PaneHeaderView({ props }).render(host)
  const header = host.firstElementChild as HTMLDivElement
  const htitle = header.querySelector('.pane-title') as HTMLSpanElement
  return { header, htitle }
}
