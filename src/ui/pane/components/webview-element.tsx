// The Electron <webview> element that hosts external web content in a browser
// pane. Pure view; the caller wires reload/external/title listeners.
export function createWebviewElement(url: string): HTMLElement {
  return (
    <webview class="pane-web" src={url} allowpopups="true" />
  ) as unknown as HTMLElement
}
