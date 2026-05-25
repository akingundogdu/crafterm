import '@xterm/xterm/css/xterm.css'
import './style.css'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { settings, loadSettings, resolveTheme, applyBgColor } from './state'
import { promptConfirm } from './dialog'

// A pop-out window hosts a single terminal pane. The PTY already exists in the
// main process (created by the main window); we adopt it so its output streams
// here, and render a fresh xterm bound to the same id.
const id = new URLSearchParams(location.search).get('id') || ''

// Mirror the main app's "running" heuristic (busy = output within ~700ms).
const BUSY_MS = 700

async function main(): Promise<void> {
  const saved = await window.crafterm.loadState()
  if (saved) loadSettings(saved)
  applyBgColor()

  const host = document.getElementById('popout-term')!
  const term = new Terminal({
    fontFamily: settings.font.family,
    fontSize: settings.font.size,
    cursorBlink: true,
    allowProposedApi: true,
    theme: resolveTheme()
  })
  const fit = new FitAddon()
  term.loadAddon(fit)

  // Shift+Enter inserts a newline in TUI line editors (parity with docked panes,
  // see pane.ts): send ESC+CR instead of the bare CR xterm would emit as "submit".
  term.attachCustomKeyEventHandler((e) => {
    if (
      e.type === 'keydown' &&
      e.key === 'Enter' &&
      e.shiftKey &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey
    ) {
      window.crafterm.input(id, '\x1b\r')
      return false
    }
    return true
  })

  term.open(host)

  window.crafterm.adoptPane(id) // route this pane's output to this window

  let lastData = 0
  window.crafterm.onData((dataId, data) => {
    if (dataId !== id) return
    term.write(data)
    lastData = Date.now()
  })
  term.onData((d) => window.crafterm.input(id, d))
  term.onTitleChange((t) => {
    if (t) document.title = t
  })
  window.crafterm.onExit((exitId) => {
    if (exitId === id) window.crafterm.popoutConfirmClose(id) // shell exited: tear down
  })

  const doFit = (): void => {
    if (!host.clientWidth) return
    try {
      fit.fit()
      window.crafterm.resize(id, term.cols, term.rows)
    } catch {
      /* resize can throw if the pty just died — safe to ignore */
    }
  }
  new ResizeObserver(doFit).observe(host)
  doFit()
  term.focus()

  // Native close button: the main process asks us to confirm first (kill the
  // pane). Only prompt if a process appears to be running.
  window.crafterm.onPopoutConfirmClose(async (closeId) => {
    if (closeId !== id) return
    const running = Date.now() - lastData < BUSY_MS
    if (running) {
      const ok = await promptConfirm({
        title: 'Close terminal?',
        message: 'A process is still running in this terminal. Close anyway?',
        confirmText: 'Close'
      })
      if (!ok) return
    }
    window.crafterm.popoutConfirmClose(id)
  })
}

void main()
