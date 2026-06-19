import { app, BrowserWindow, Notification, Menu } from 'electron'
import { join } from 'path'
import { handle, on, emit } from '@services/channels.main'
import * as terminal from '../services/terminal.manager'
import { APP_NAME } from '../constants'

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
  const isE2E = !!process.env['CRAFTERM_E2E']
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    fullscreen: !isE2E, // always launch in native macOS fullscreen (except E2E)
    backgroundColor: '#0d1117',
    titleBarStyle: 'hiddenInset', // native traffic lights floating over the sidebar
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true // embedded browser panes (opening terminal links in-app)
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (!isE2E) mainWindow?.show()
  })

  // Tell the renderer about fullscreen state — macOS hides the traffic lights
  // while fullscreen, so the renderer can drop the left-side padding reserved
  // for them. Re-broadcast on every transition and once on initial load.
  const broadcastFullscreen = (): void => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      emit(mainWindow.webContents, 'window:fullscreen', mainWindow.isFullScreen())
    }
  }
  mainWindow.on('enter-full-screen', broadcastFullscreen)
  mainWindow.on('leave-full-screen', broadcastFullscreen)
  mainWindow.webContents.once('did-finish-load', broadcastFullscreen)

  // Drop the reference once the window is gone, so the guards in the PTY
  // callbacks short-circuit instead of touching a destroyed object.
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // electron-vite sets ELECTRON_RENDERER_URL in dev (Vite server); in prod we load the built file.
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// --- Pop-out windows: host a single pane's terminal in its own window ---
function createPopoutWindow(paneId: string, title?: string): void {
  const existing = terminal.getPopout(paneId)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return
  }
  const win = new BrowserWindow({
    width: 720,
    height: 480,
    backgroundColor: '#0d1117',
    title: title || APP_NAME,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  const qs = `id=${encodeURIComponent(paneId)}`
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/popout.html?${qs}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/popout.html'), { search: qs })
  }
  terminal.setPopout(paneId, win)
  // The native close button needs a running-process confirm (done in the
  // pop-out renderer). Intercept unless we're quitting or the kill is confirmed.
  win.on('close', (e) => {
    if (quitting || allowClose.has(paneId)) return
    e.preventDefault()
    if (!win.webContents.isDestroyed()) emit(win.webContents, 'popout:confirm-close', { id: paneId })
  })
  win.on('closed', () => {
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
    label: 'View',
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
      label: 'Pane',
      submenu: [
        {
          label: 'Close Pane',
          accelerator: 'CmdOrCtrl+W',
          // In a pop-out window Cmd+W closes that window; otherwise it closes
          // the active pane in the main window.
          click: (_item, win) => {
            if (win && win !== mainWindow) win.close()
            else terminal.sendToRenderer('menu:close-pane', null)
          }
        }
      ]
    },
    {
      label: 'Window',
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
  handle('popout:open', ({ paneId, title }) => {
    createPopoutWindow(paneId, title)
  })

  // The pop-out renderer confirmed the kill: close its window and tell the main
  // window to drop the pane (which kills the PTY).
  on('popout:close-confirmed', ({ id }) => {
    allowClose.add(id)
    terminal.getPopout(id)?.close()
    terminal.sendToRenderer('popout:killed', { id })
  })

  on('popout:focus', ({ id }) => {
    const win = terminal.getPopout(id)
    if (win && !win.isDestroyed()) win.focus()
  })

  // --- Improve Crafterm detached window: a standalone Improve panel window ---
  handle('improve-window:open', () => {
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
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })
    if (process.env['ELECTRON_RENDERER_URL']) {
      improveWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/improve-window.html`)
    } else {
      improveWin.loadFile(join(__dirname, '../renderer/improve-window.html'))
    }
    improveWin.on('closed', () => {
      improveWin = null
    })
  })

  on('improve-window:set-always-on-top', ({ value }) => {
    if (improveWin && !improveWin.isDestroyed()) improveWin.setAlwaysOnTop(!!value)
  })

  on('notify', ({ title, body, paneId }) => {
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
        n.on('click', () => {
          // bring the app/window forward and focus the pane that triggered it
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.show()
            mainWindow.focus()
          }
          app.focus({ steal: true })
          if (paneId) terminal.sendToRenderer('focus-pane', { id: paneId })
        })
        n.show()
      } catch (err) {
        console.error('[notify] failed to show notification:', err)
      }
  })
}
