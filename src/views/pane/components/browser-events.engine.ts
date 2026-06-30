import type { BrowserPane } from '@views/types/types'
import { makeBrowserReload, makeBrowserExternal, makeBrowserTitleUpdate } from '../pane.state'

export interface BrowserEventsDeps {
  bp: BrowserPane
  webview: HTMLElement
  htitle: HTMLElement
  reload: HTMLButtonElement
  ext: HTMLButtonElement
}

// Wires a browser pane's reload button, open-in-external-browser button, and the
// webview's page-title-updated -> header-title listener. Byte-identical to the
// inline createBrowserPane wiring.
export function setupBrowserEvents(deps: BrowserEventsDeps): void {
  const { bp, webview, htitle, reload, ext } = deps
  reload.addEventListener('click', makeBrowserReload(webview))
  ext.addEventListener('click', makeBrowserExternal(bp))
  webview.addEventListener('page-title-updated', makeBrowserTitleUpdate(htitle))
}
