import { shell, type WebContents } from 'electron'
import { Events } from '../events/events'
import { env } from '@configs/environment-variables'

// A renderer window holds the preload bridge, so it must never be able to navigate to, or
// open, content we don't control: a remote origin loaded into the top frame would inherit
// that bridge. The app's own surfaces never navigate — the renderer is a single page, and
// remote pages belong in a <webview> (browser pane), which is a separate web-contents with
// no preload and no Node.
//
// Applied to every window we create (main, pop-out, improve).

const EXTERNAL_SCHEMES = new Set(['https:', 'http:', 'mailto:'])

// The renderer's own origin: the Vite dev server in dev, a file:// bundle when packaged.
function isAppUrl(url: string): boolean {
  const devUrl = env.rendererUrl()
  if (devUrl && url.startsWith(devUrl)) return true
  return url.startsWith('file://')
}

function openExternally(url: string): void {
  try {
    if (EXTERNAL_SCHEMES.has(new URL(url).protocol)) void shell.openExternal(url)
  } catch {
    // not a parseable URL — drop it
  }
}

// Hardens one window's web contents: no in-place navigation away from the app, no popups
// into a bridged window, and any <webview> it attaches gets stripped of Node/preload.
export function hardenWindow(wc: WebContents): void {
  wc.setWindowOpenHandler(({ url }) => {
    openExternally(url)
    return { action: 'deny' }
  })

  wc.on(Events.WebContents.WillNavigate, (e, url) => {
    if (isAppUrl(url)) return
    e.preventDefault()
    openExternally(url)
  })

  // A browser pane must stay a plain web view: no preload, no Node, context-isolated.
  wc.on(Events.WebContents.WillAttachWebview, (_e, webPreferences) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
  })

  // `allowpopups` lets a page in a browser pane call window.open; send those to the real
  // browser instead of spawning an unconstrained Electron window.
  wc.on(Events.WebContents.DidAttachWebview, (_e, guest) => {
    guest.setWindowOpenHandler(({ url }) => {
      openExternally(url)
      return { action: 'deny' }
    })
  })
}
