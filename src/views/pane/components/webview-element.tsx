import { Component } from '@geajs/core'

// The Electron <webview> element that hosts external web content in a browser
// pane. Pure view; the caller wires reload/external/title listeners. `webview` is
// a non-standard (Electron) tag; `src`/`allowpopups` are set as string attributes.
class WebviewElement extends Component {
  private readonly url: string

  constructor(opts: { url: string }) {
    super()
    this.url = opts.url
  }

  template() {
    return <webview class="pane-web" src={this.url} allowpopups="true" />
  }
}

export function createWebviewElement(url: string): HTMLElement {
  const host = document.createElement('div')
  new WebviewElement({ url }).render(host)
  return host.firstElementChild as HTMLElement
}
