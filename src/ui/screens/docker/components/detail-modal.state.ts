import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { DockerKind } from '@services/docker/docker.types'
import { settings, resolveTheme } from '@ui/state/state'
import { terminalService } from '@services'
import { UITexts } from '@texts'
import type { EmbeddedTerm, DetailTab } from './detail-modal.types'

// Spawn a pty, mount an xterm into `hostEl`, and inject `command` once the login
// shell has settled. Output is routed to this xterm by a pty-id-filtered
// onData/onExit listener so it never collides with the main `panes` stream.
export async function makeEmbeddedTerm(hostEl: HTMLElement, command: string): Promise<EmbeddedTerm> {
  const id = await terminalService.createPty({})
  const term = new Terminal({
    fontFamily: settings.font.family,
    fontSize: settings.font.size,
    cursorBlink: true,
    allowProposedApi: true,
    theme: resolveTheme()
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.open(hostEl)
  const sync = (): void => {
    try {
      fit.fit()
      terminalService.resize(id, term.cols, term.rows)
    } catch {
      /* fit can throw before the host is laid out — safe to ignore */
    }
  }
  sync()
  term.onData((d) => terminalService.input(id, d))
  let exited = false
  const onData = (pid: string, data: string): void => {
    if (pid === id) term.write(data)
  }
  const onExit = (pid: string): void => {
    if (pid === id) {
      exited = true
      term.write('\r\n\x1b[2m[process exited]\x1b[0m')
    }
  }
  terminalService.onData(onData)
  terminalService.onExit(onExit)
  const ro = new ResizeObserver(() => sync())
  ro.observe(hostEl)
  setTimeout(() => terminalService.input(id, command + '\r'), 350)
  return {
    dispose: () => {
      ro.disconnect()
      if (!exited) terminalService.kill(id)
      term.dispose()
    }
  }
}

// Parsed inspect JSON (first element when it's an array), or null when unparseable.
export function parseInspect(raw: string): Record<string, unknown> | null {
  try {
    const j = JSON.parse(raw)
    return Array.isArray(j) ? j[0] : j
  } catch {
    return null
  }
}

// Tabs available for a resource kind. Containers get Inspect/Logs (+ Terminal when
// running); other kinds get Inspect only.
export function tabsFor(kind: DockerKind, running?: boolean): { key: DetailTab; label: string }[] {
  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'inspect', label: UITexts.Docker.detail.inspect }
  ]
  if (kind === 'container') {
    tabs.push({ key: 'logs', label: UITexts.Docker.detail.logs })
    if (running) tabs.push({ key: 'terminal', label: UITexts.Docker.detail.terminal })
  }
  return tabs
}

// Raw-JSON / structured toggle for the inspect panel. Reads its button from the
// event so it needs no element reference threaded in.
export function makeRawToggle(table: HTMLElement, pre: HTMLElement): (e: MouseEvent) => void {
  return (e) => {
    const toggle = e.currentTarget as HTMLButtonElement
    const showRaw = pre.style.display === 'none'
    pre.style.display = showRaw ? '' : 'none'
    table.style.display = showRaw ? 'none' : ''
    toggle.textContent = showRaw ? UITexts.Docker.detail.structured : UITexts.Docker.detail.rawJson
  }
}

// Closes the modal on Escape and unregisters the listener when it closes.
export function bindEscapeClose(close: () => void, onClose: (cb: () => void) => void): void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKey, true)
  onClose(() => document.removeEventListener('keydown', onKey, true))
}
