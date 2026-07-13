import { Component } from '@geajs/core'
import './pane-box.css'

// The pane-box shells for the browser + doc panes. Thin gea shells (§5.11): the
// template is the empty `.pane-box` with its data-pane-id + select handler; the
// factory returns the raw box so the pane creators append their imperative
// widgets (header, <webview>, markdown preview, editor) into it, exactly as the
// code-pane / file-pane shells do.
class BrowserPaneBox extends Component {
  private readonly paneId: string
  private readonly onSelect: (e: MouseEvent) => void

  constructor(opts: { id: string; onSelect: (e: MouseEvent) => void }) {
    super()
    this.paneId = opts.id
    this.onSelect = opts.onSelect
  }

  template() {
    return <div class="pane-box browser-pane" data-pane-id={this.paneId} onMouseDown={this.onSelect} />
  }
}

class DocPaneBox extends Component {
  private readonly paneId: string
  private readonly onSelect: (e: MouseEvent) => void

  constructor(opts: { id: string; onSelect: (e: MouseEvent) => void }) {
    super()
    this.paneId = opts.id
    this.onSelect = opts.onSelect
  }

  template() {
    return <div class="pane-box doc-pane" data-pane-id={this.paneId} onMouseDown={this.onSelect} />
  }
}

export function buildBrowserPaneBox(id: string, onSelect: (e: MouseEvent) => void): HTMLElement {
  const host = document.createElement('div')
  new BrowserPaneBox({ id, onSelect }).render(host)
  return host.firstElementChild as HTMLElement
}

export function buildDocPaneBox(id: string, onSelect: (e: MouseEvent) => void): HTMLElement {
  const host = document.createElement('div')
  new DocPaneBox({ id, onSelect }).render(host)
  return host.firstElementChild as HTMLElement
}
