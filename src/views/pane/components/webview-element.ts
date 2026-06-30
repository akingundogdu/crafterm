// The Electron <webview> element that hosts external web content in a browser
// pane. Pure view; the caller wires reload/external/title listeners. `webview` is
// a non-standard tag (Electron), so it's built imperatively rather than via el().
export function createWebviewElement(url: string): HTMLElement {
  const webview = document.createElement('webview')
  webview.className = 'pane-web'
  webview.setAttribute('src', url)
  webview.setAttribute('allowpopups', 'true')
  return webview
}
