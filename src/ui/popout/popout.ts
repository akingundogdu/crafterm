import '@xterm/xterm/css/xterm.css'
import '@ui/styles/tokens.css'
import '@ui/styles/global.css'
import './popout.css'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { settings, resolveTheme, applyBgColor } from '@ui/state/state'
import { loadSettings } from '@repositories/settings.service'
import { terminalService, storeService } from '@services'
import { makeCustomKeyHandler, makeConfirmClose } from './popout.state'

// A pop-out window hosts a single terminal pane. The PTY already exists in the
// main process (created by the main window); we adopt it so its output streams
// here, and render a fresh xterm bound to the same id.
const id = new URLSearchParams(location.search).get('id') || ''

async function main(): Promise<void> {
  const saved = await storeService.load()
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

  term.attachCustomKeyEventHandler(makeCustomKeyHandler(id))

  term.open(host)

  terminalService.adoptPane(id) // route this pane's output to this window

  let lastData = 0
  terminalService.onData((dataId, data) => {
    if (dataId !== id) return
    term.write(data)
    lastData = Date.now()
  })
  term.onData((d) => terminalService.input(id, d))
  term.onTitleChange((t) => {
    if (t) document.title = t
  })
  terminalService.onExit((exitId) => {
    if (exitId === id) terminalService.popoutConfirmClose(id) // shell exited: tear down
  })

  const doFit = (): void => {
    if (!host.clientWidth) return
    try {
      fit.fit()
      terminalService.resize(id, term.cols, term.rows)
    } catch {
      /* resize can throw if the pty just died — safe to ignore */
    }
  }
  new ResizeObserver(doFit).observe(host)
  doFit()
  term.focus()

  terminalService.onPopoutConfirmClose(makeConfirmClose(id, () => lastData))
}

void main()
