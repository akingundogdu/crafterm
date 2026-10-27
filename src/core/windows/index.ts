import { app, BrowserWindow, Notification, Menu, screen } from 'electron'
import { handle, on, emit, Channel } from '@services/channels.main'
import * as terminal from '../services/terminal.manager/terminal.manager.service'
import { APP_NAME } from '../constants/constants'
import { Events } from '../events/events'
import { env } from '@configs/environment-variables'
import { preloadPath, rendererHtmlPath, RENDERER_HTML } from './window-paths'
import { hardenWindow } from './window-security'
import { visiblePopoutBounds } from './popout-bounds'
import type { PopoutBounds } from '@services/pty/pty.types'
import { UITexts } from '@texts'

let mainWindow: BrowserWindow | null = null
// The single detached "Improve Crafterm" window, if open.
let improveWin: BrowserWindow | null = null
let quitting = false
// Pane ids whose pop-out window is allowed to actually close (kill confirmed).
const allowClose = new Set<string>()

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

// Flagged on app before-quit so a pop-out's close handler stops intercepting.
export function setQuitting(): void {
  quitting = true
}

export function createMainWindow(): void {
  // Under E2E the window launches windowed (no native fullscreen) and stays
  // hidden, so the test run never steals focus or flips macOS Spaces. Playwright
  // still captures the offscreen-rendered page. A fixed size also makes
  // visual-regression snapshots independent of the developer's actual display.
  const isE2E = env.isE2E()
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    fullscreen: !isE2E, // always launch in native macOS fullscreen (except E2E)
    backgroundColor: '#0d1117',
    titleBarStyle: 'hiddenInset', // native traffic lights floating over the sidebar
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      webviewTag: true // embedded browser panes (opening terminal links in-app)
    }
  })

  hardenWindow(mainWindow.webContents)

  mainWindow.on(Events.Window.ReadyToShow, () => {
    if (!isE2E) mainWindow?.show()
  })

  // Tell the renderer about fullscreen state — macOS hides the traffic lights
  // while fullscreen, so the renderer can drop the left-side padding reserved
  // for them. Re-broadcast on every transition and once on initial load.
  const broadcastFullscreen = (): void => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      emit(mainWindow.webContents, Channel.Window.Fullscreen, mainWindow.isFullScreen())
    }
  }
  mainWindow.on(Events.Window.EnterFullScreen, broadcastFullscreen)
  mainWindow.on(Events.Window.LeaveFullScreen, broadcastFullscreen)
  mainWindow.webContents.once(Events.WebContents.DidFinishLoad, broadcastFullscreen)

  // Drop the reference once the window is gone, so the guards in the PTY
  // callbacks short-circuit instead of touching a destroyed object.
  mainWindow.on(Events.Window.Closed, () => {
    mainWindow = null
  })

  // electron-vite sets ELECTRON_RENDERER_URL in dev (Vite server); in prod we load the built file.
  // Under E2E the renderer skips the boot skeleton's hold — a purely cosmetic
  // delay would add seconds to every spec that waits for the shell.
  const devUrl = env.rendererUrl()
  const search = isE2E ? 'e2e=1' : ''
  if (devUrl) {
    mainWindow.loadURL(search ? `${devUrl}?${search}` : devUrl)
  } else {
    mainWindow.loadFile(rendererHtmlPath('index'), search ? { search } : undefined)
  }
}

// --- Pop-out windows: host a single pane's terminal in its own window ---
// `stableId` is the pane's CRAFTERM_PANE_ID, which the pop-out needs to match
// `claude:waitingChanged` events to its pane. `bounds` reopens a restored pop-out
// where it was, when that spot is still on a connected display.
function createPopoutWindow(paneId: string, title?: string, stableId?: string, bounds?: PopoutBounds): void {
  const existing = terminal.getPopout(paneId)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return
  }
  const restored = bounds ? visiblePopoutBounds(bounds, screen.getAllDisplays().map((d) => d.workArea)) : null
  const win = new BrowserWindow({
    width: restored?.width ?? 720,
    height: restored?.height ?? 480,
    ...(restored ? { x: restored.x, y: restored.y } : {}),
    backgroundColor: '#0d1117',
    title: title || APP_NAME,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: preloadPath(),
      sandbox: false
    }
  })
  hardenWindow(win.webContents)

  const qs = new URLSearchParams({ id: paneId, ...(stableId ? { stableId } : {}) }).toString()
  const devUrl = env.rendererUrl()
  if (devUrl) {
    win.loadURL(`${devUrl}/${RENDERER_HTML.popout}?${qs}`)
  } else {
    win.loadFile(rendererHtmlPath('popout'), { search: qs })
  }
  terminal.setPopout(paneId, win)
  // Report the window's position + size (once now, then after every move/resize)
  // so the main window persists it and reopens the pop-out in place on restart.
  const reportBounds = (): void => {
    if (!win.isDestroyed()) terminal.sendToRenderer(Channel.Popout.Bounds, { id: paneId, bounds: win.getBounds() })
  }
  win.on(Events.Window.Moved, reportBounds)
  win.on(Events.Window.Resized, reportBounds)
  reportBounds()
  // The native close button needs a running-process confirm (done in the
  // pop-out renderer). Intercept unless we're quitting or the kill is confirmed.
  win.on(Events.Window.Close, (e) => {
    if (quitting || allowClose.has(paneId)) return
    e.preventDefault()
    if (!win.webContents.isDestroyed()) emit(win.webContents, Channel.Popout.ConfirmClose, { id: paneId })
  })
  win.on(Events.Window.Closed, () => {
    terminal.deletePopout(paneId)
    allowClose.delete(paneId)
    terminal.deleteOwner(paneId)
  })
}

// Custom app menu so the bold macOS menu title shows the app name (the default
// dev bundle would otherwise read "Electron"). Standard roles keep copy/paste etc.
export function buildAppMenu(): void {
  if (process.platform !== 'darwin') return
  // Cmd+W lives on a real menu accelerator so it fires even when an embedded
  // <webview> (browser pane) has focus, where renderer keydown never arrives.
  // Custom View submenu (no Reload / Force Reload — Cmd+R would otherwise blow
  // away every pane's state. Devtools and zoom stay so debugging still works.)
  const viewMenu: Electron.MenuItemConstructorOptions = {
    label: UITexts.Menu.view,
    submenu: [
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  }
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    viewMenu,
    {
      label: UITexts.Menu.pane,
      submenu: [
        {
          label: UITexts.Menu.closePane,
          accelerator: 'CmdOrCtrl+W',
          // In a pop-out window Cmd+W closes that window; otherwise it closes
          // the active pane in the main window.
          click: (_item, win) => {
            if (win && win !== mainWindow) win.close()
            else terminal.sendToRenderer(Channel.Menu.ClosePane, null)
          }
        }
      ]
    },
    {
      label: UITexts.Menu.window,
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'close', accelerator: 'CmdOrCtrl+Shift+W' } // window close moves to Shift+W
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// Window bridge: pop-out windows (popout:*), the detached Improve panel
// (improve-window:*), and native notifications (notify).
export function registerWindowIpc(): void {
  handle(Channel.Popout.Open, ({ paneId, title, stableId, bounds }) => {
    createPopoutWindow(paneId, title, stableId, bounds)
  })

  // The pop-out renderer confirmed the kill: close its window and tell the main
  // window to drop the pane (which kills the PTY).
  on(Channel.Popout.CloseConfirmed, ({ id }) => {
    allowClose.add(id)
    terminal.getPopout(id)?.close()
    terminal.sendToRenderer(Channel.Popout.Killed, { id })
  })

  // The main window docked the pane back: close its window without the kill
  // confirm. The PTY keeps running; closing drops the pop-out as its owner, so
  // the output flows to the main window again.
  on(Channel.Popout.Dock, ({ id }) => {
    allowClose.add(id)
    terminal.getPopout(id)?.close()
  })

  on(Channel.Popout.Focus, ({ id }) => {
    const win = terminal.getPopout(id)
    if (win && !win.isDestroyed()) win.focus()
  })

  // --- Improve Crafterm detached window: a standalone Improve panel window ---
  handle(Channel.ImproveWindow.Open, () => {
    if (improveWin && !improveWin.isDestroyed()) {
      improveWin.focus()
      return
    }
    improveWin = new BrowserWindow({
      width: 760,
      height: 900,
      backgroundColor: '#0d1117',
      title: 'Improve Crafterm',
      titleBarStyle: 'hiddenInset',
      webPreferences: {
        preload: preloadPath(),
        sandbox: false
      }
    })
    hardenWindow(improveWin.webContents)

    const devUrl = env.rendererUrl()
    if (devUrl) {
      improveWin.loadURL(`${devUrl}/${RENDERER_HTML.improveWindow}`)
    } else {
      improveWin.loadFile(rendererHtmlPath('improveWindow'))
    }
    improveWin.on(Events.Window.Closed, () => {
      improveWin = null
    })
  })

  on(Channel.ImproveWindow.SetAlwaysOnTop, ({ value }) => {
    if (improveWin && !improveWin.isDestroyed()) improveWin.setAlwaysOnTop(!!value)
  })

  on(Channel.Notify.Show, ({ title, body, paneId }) => {
    if (!Notification.isSupported()) {
      console.warn('[notify] native notifications are not supported here')
      return
    }
      // When the app window is in the foreground the user is already looking at
      // it — show only the in-app card (the renderer surfaces that itself) and
      // skip the OS notification so it doesn't double-notify.
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) return
      try {
        const n = new Notification({ title, body, silent: false })
        n.on(Events.Notification.Click, () => {
          // bring the app/window forward and focus the pane that triggered it
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.show()
            mainWindow.focus()
          }
          app.focus({ steal: true })
          if (paneId) terminal.sendToRenderer(Channel.Pane.Focus, { id: paneId })
        })
        n.show()
      } catch (err) {
        console.error('[notify] failed to show notification:', err)
      }
  })
}
