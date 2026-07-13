import { Component } from '@geajs/core'
import { makeCloseClick } from '../pane.store'
import { createWebviewElement } from './webview-element'

export interface BrowserPaneHeader {
  header: HTMLDivElement
  htitle: HTMLSpanElement
  reload: HTMLButtonElement
  ext: HTMLButtonElement
  webview: HTMLElement
}

// The browser pane's header: title + reload/ext/menu/close buttons. Data arrives
// via the constructor into plain fields — a gea Component only populates
// `this.props` when rendered from a parent template, not a manual `new X()`. The
// ⋯ button opens the pane options popup anchored at itself (its own currentTarget).
class BrowserPaneHeaderView extends Component {
  private readonly paneId: string
  private readonly url: string
  private readonly onMenu: (anchor: HTMLElement) => void

  constructor(opts: { id: string; url: string; onMenu: (anchor: HTMLElement) => void }) {
    super()
    this.paneId = opts.id
    this.url = opts.url
    this.onMenu = opts.onMenu
  }

  template() {
    return (
      <div class="pane-header">
        <span class="pane-title">{this.url}</span>
        <button class="pane-btn" title="Reload">
          ⟳
        </button>
        <button class="pane-btn" title="Open in external browser">
          ↗
        </button>
        <button
          class="pane-btn"
          title="Pane options"
          onClick={(e: MouseEvent) => {
            e.stopPropagation()
            this.onMenu(e.currentTarget as HTMLElement)
          }}
        >
          ⋯
        </button>
        <button class="pane-close" onClick={makeCloseClick(this.paneId)}>
          ×
        </button>
      </div>
    )
  }
}

// Builds the browser pane's header and the <webview>. The caller
// (createBrowserPane) wires reload/ext/title listeners and the select handler
// afterward; only the menu and close buttons are self-contained here.
export function createBrowserPaneHeader(
  id: string,
  url: string,
  onMenu: (anchor: HTMLElement) => void
): BrowserPaneHeader {
  const host = document.createElement('div')
  new BrowserPaneHeaderView({ id, url, onMenu }).render(host)
  const header = host.firstElementChild as HTMLDivElement
  const htitle = header.querySelector('.pane-title') as HTMLSpanElement
  const btns = header.querySelectorAll('.pane-btn')
  const reload = btns[0] as HTMLButtonElement
  const ext = btns[1] as HTMLButtonElement

  const webview = createWebviewElement(url)

  return { header, htitle, reload, ext, webview }
}
