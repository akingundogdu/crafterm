import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { DockerKind } from '@bridge/api'
import { settings, resolveTheme } from '../../../state'
import { terminalService, dockerService } from '../../../services/ipc'
import { makeCloseButton } from '../../../dialog'
import { createButton, createOverlay } from '@ui/components'
import { inspectFields } from '../inspect'

// The Docker resource detail modal: a tabbed Inspect / Logs / Terminal view.
// Containers get all three (Terminal only when running); other kinds get Inspect
// only. Logs/Terminal embed a real pty-backed xterm, disposed on close.

interface EmbeddedTerm {
  dispose: () => void
}

// Spawn a pty, mount an xterm into `hostEl`, and inject `command` once the login
// shell has settled. Output is routed to this xterm by a pty-id-filtered
// onData/onExit listener so it never collides with the main `panes` stream.
async function makeEmbeddedTerm(hostEl: HTMLElement, command: string): Promise<EmbeddedTerm> {
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

// Render the parsed inspect into a structured table, with a Raw JSON toggle.
function renderInspectInto(panel: HTMLElement, kind: DockerKind, raw: string): void {
  panel.replaceChildren()
  let parsed: Record<string, unknown> | null = null
  try {
    const j = JSON.parse(raw)
    parsed = Array.isArray(j) ? j[0] : j
  } catch {
    parsed = null
  }
  if (!parsed) {
    const pre = document.createElement('pre')
    pre.className = 'docker-pre'
    pre.textContent = raw || '(empty)'
    panel.appendChild(pre)
    return
  }

  const table = document.createElement('div')
  table.className = 'docker-kv'
  for (const [label, value] of inspectFields(kind, parsed)) {
    const k = document.createElement('div')
    k.className = 'docker-kv-key'
    k.textContent = label
    const v = document.createElement('div')
    v.className = 'docker-kv-val'
    v.textContent = value
    table.append(k, v)
  }

  const pre = document.createElement('pre')
  pre.className = 'docker-pre'
  pre.style.display = 'none'
  pre.textContent = JSON.stringify(parsed, null, 2)

  const toggle = createButton({
    className: 'settings-inline-btn docker-raw-toggle',
    text: 'Raw JSON',
    onClick: () => {
      const showRaw = pre.style.display === 'none'
      pre.style.display = showRaw ? '' : 'none'
      table.style.display = showRaw ? 'none' : ''
      toggle.textContent = showRaw ? 'Structured' : 'Raw JSON'
    }
  })

  panel.append(toggle, table, pre)
}

type DetailTab = 'inspect' | 'logs' | 'terminal'

// Open the rich detail modal. Containers get Inspect/Logs/Terminal (Terminal
// only when running); images/volumes/networks get Inspect only.
export function showDetailModal(opts: {
  kind: DockerKind
  id: string
  name: string
  running?: boolean
  initial?: DetailTab
}): void {
  const { kind, id, name, running } = opts
  const tabs: { key: DetailTab; label: string }[] = [{ key: 'inspect', label: 'Inspect' }]
  if (kind === 'container') {
    tabs.push({ key: 'logs', label: 'Logs' })
    if (running) tabs.push({ key: 'terminal', label: 'Terminal' })
  }

  const { overlay, mount, close, onClose } = createOverlay()
  const modal = document.createElement('div')
  modal.className = 'modal docker-detail-modal'
  overlay.appendChild(modal)

  const embedded: EmbeddedTerm[] = []
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  onClose(() => {
    document.removeEventListener('keydown', onKey, true)
    embedded.forEach((t) => t.dispose())
  })
  document.addEventListener('keydown', onKey, true)
  modal.appendChild(makeCloseButton(close))

  const h = document.createElement('h2')
  h.textContent = `${name}`
  modal.appendChild(h)

  const tabBar = document.createElement('div')
  tabBar.className = 'docker-detail-tabs'
  modal.appendChild(tabBar)

  const body = document.createElement('div')
  body.className = 'docker-detail-body'
  modal.appendChild(body)

  // Lazily build each panel on first activation (so an unopened Terminal tab
  // never spawns a pty).
  const panels = new Map<DetailTab, HTMLElement>()
  const built = new Set<DetailTab>()
  const buildPanel = (key: DetailTab): HTMLElement => {
    const panel = document.createElement('div')
    panel.className = 'docker-detail-panel'
    panel.style.display = 'none'
    body.appendChild(panel)
    panels.set(key, panel)
    return panel
  }
  const activate = (key: DetailTab): void => {
    tabBar.querySelectorAll('.docker-detail-tab').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.tab === key)
    })
    panels.forEach((p, k) => {
      p.style.display = k === key ? '' : 'none'
    })
    if (built.has(key)) return
    built.add(key)
    const panel = panels.get(key)!
    if (key === 'inspect') {
      panel.textContent = 'Loading…'
      void dockerService.inspect(kind, id).then((raw) => renderInspectInto(panel, kind, raw))
    } else if (key === 'logs') {
      const termHost = document.createElement('div')
      termHost.className = 'docker-term-host'
      panel.appendChild(termHost)
      void makeEmbeddedTerm(termHost, `docker logs -f --tail 500 ${id}`).then((t) => embedded.push(t))
    } else {
      const termHost = document.createElement('div')
      termHost.className = 'docker-term-host'
      panel.appendChild(termHost)
      void makeEmbeddedTerm(termHost, `docker exec -it ${id} sh`).then((t) => embedded.push(t))
    }
  }

  tabs.forEach((t) => {
    buildPanel(t.key)
    const b = createButton({
      className: 'docker-detail-tab',
      text: t.label,
      onClick: () => activate(t.key)
    })
    b.dataset.tab = t.key
    tabBar.appendChild(b)
  })

  mount()
  activate(opts.initial && tabs.some((t) => t.key === opts.initial) ? opts.initial : tabs[0].key)
}
