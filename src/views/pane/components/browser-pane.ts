import { el } from '@views/lib/dom'
import { makeCloseClick } from '../pane.state'
import { createWebviewElement } from './webview-element'

export interface BrowserPaneHeader {
  header: HTMLDivElement
  htitle: HTMLSpanElement
  reload: HTMLButtonElement
  ext: HTMLButtonElement
  webview: HTMLElement
}

// Builds the browser pane's header (title + reload/ext/menu/close buttons) and
// the <webview>. The caller (createBrowserPane) wires reload/ext/title listeners
// and the select handler afterward; only the menu and close buttons are
// self-contained here. `onMenu` opens the pane options popup anchored at the ⋯.
export function createBrowserPaneHeader(
  id: string,
  url: string,
  onMenu: (anchor: HTMLElement) => void
): BrowserPaneHeader {
  const htitle = el('span', { class: 'pane-title' }, url)

  const reload = el('button', { class: 'pane-btn', title: 'Reload' }, '⟳')
  const ext = el('button', { class: 'pane-btn', title: 'Open in external browser' }, '↗')
  const menuBtn = el(
    'button',
    {
      class: 'pane-btn',
      title: 'Pane options',
      onClick: (e: MouseEvent) => {
        e.stopPropagation()
        onMenu(menuBtn)
      }
    },
    '⋯'
  )
  const close = el('button', { class: 'pane-close', onClick: makeCloseClick(id) }, '×')
  const header = el('div', { class: 'pane-header' }, htitle, reload, ext, menuBtn, close)

  const webview = createWebviewElement(url)

  return { header, htitle, reload, ext, webview }
}
