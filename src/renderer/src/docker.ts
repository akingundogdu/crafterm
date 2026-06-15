import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { DockerRow, DockerKind } from '../../preload/api'
import { openTerminalRunning } from './commands'
import { makeCloseButton, promptConfirm } from './dialog'
import { settings, resolveTheme } from './state'
import { terminalService, dockerService } from './services/ipc'

type SubTab = 'containers' | 'images' | 'volumes' | 'networks' | 'compose'

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'containers', label: 'Containers' },
  { key: 'images', label: 'Images' },
  { key: 'volumes', label: 'Volumes' },
  { key: 'networks', label: 'Networks' },
  { key: 'compose', label: 'Compose' }
]

let host: HTMLElement | null = null
let subTab: SubTab = 'containers'
let filter = ''
const stats = new Map<string, DockerRow>() // container id/name -> live stats row

// Field lookup tolerant of docker's capitalised json keys.
const f = (row: DockerRow, ...keys: string[]): string => {
  for (const k of keys) if (row[k] != null && row[k] !== '') return String(row[k])
  return ''
}

// ---- read-only detail modal (inspect / logs) ----------------------------
function showTextModal(title: string, text: string): void {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal docker-text-modal'
  overlay.appendChild(modal)
  const close = (): void => {
    document.removeEventListener('keydown', onKey, true)
    overlay.remove()
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  document.addEventListener('keydown', onKey, true)
  modal.appendChild(makeCloseButton(close))
  const h = document.createElement('h2')
  h.textContent = title
  modal.appendChild(h)
  const pre = document.createElement('pre')
  pre.className = 'docker-pre'
  pre.textContent = text || '(empty)'
  modal.appendChild(pre)
  document.body.appendChild(overlay)
}

// ---- embedded terminal (live logs / exec) -------------------------------

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

// ---- structured inspect view --------------------------------------------

type KV = [string, string]

function fmtPorts(host: Record<string, unknown>): string {
  const ports = (host?.NetworkSettings as { Ports?: Record<string, unknown> })?.Ports
  if (!ports || typeof ports !== 'object') return ''
  const out: string[] = []
  for (const [container, binds] of Object.entries(ports)) {
    if (Array.isArray(binds) && binds.length) {
      for (const b of binds as { HostIp?: string; HostPort?: string }[]) {
        out.push(`${b.HostIp || '0.0.0.0'}:${b.HostPort} → ${container}`)
      }
    } else {
      out.push(container)
    }
  }
  return out.join('\n')
}

// Build the high-value [label, value] pairs for a parsed inspect object by kind.
function inspectFields(kind: DockerKind, o: Record<string, unknown>): KV[] {
  const get = (path: string): unknown =>
    path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], o)
  const str = (v: unknown): string =>
    v == null ? '' : Array.isArray(v) ? v.join('\n') : typeof v === 'object' ? JSON.stringify(v) : String(v)
  const rows: KV[] = []
  const push = (label: string, value: string): void => {
    if (value && value.trim()) rows.push([label, value])
  }
  if (kind === 'container') {
    const state = get('State') as Record<string, unknown> | undefined
    push('State', [str(state?.Status), state?.Running ? '(running)' : ''].filter(Boolean).join(' '))
    push('Image', str(get('Config.Image')))
    push('Command', [str(get('Path')), ...((get('Args') as string[]) || [])].filter(Boolean).join(' '))
    push('Created', str(get('Created')))
    push('Restart', str(get('HostConfig.RestartPolicy.Name')))
    push('Ports', fmtPorts(o))
    const mounts = (get('Mounts') as { Source?: string; Destination?: string }[]) || []
    push('Mounts', mounts.map((m) => `${m.Source || ''} → ${m.Destination || ''}`).join('\n'))
    const nets = (get('NetworkSettings.Networks') as Record<string, { IPAddress?: string }>) || {}
    push(
      'Networks',
      Object.entries(nets)
        .map(([n, v]) => `${n}${v?.IPAddress ? ' (' + v.IPAddress + ')' : ''}`)
        .join('\n')
    )
    push('Env', str(get('Config.Env')))
  } else if (kind === 'image') {
    push('Id', str(o.Id))
    push('RepoTags', str(o.RepoTags))
    push('Size', str(o.Size))
    push('Architecture', [str(o.Os), str(o.Architecture)].filter(Boolean).join('/'))
    push('Created', str(o.Created))
    push('Cmd', str(get('Config.Cmd')))
    push('Env', str(get('Config.Env')))
    const layers = (get('RootFS.Layers') as unknown[]) || []
    push('Layers', layers.length ? String(layers.length) : '')
  } else if (kind === 'volume') {
    push('Name', str(o.Name))
    push('Driver', str(o.Driver))
    push('Mountpoint', str(o.Mountpoint))
    push('Scope', str(o.Scope))
    push('Created', str(o.CreatedAt))
    push('Labels', str(o.Labels))
  } else {
    push('Name', str(o.Name))
    push('Driver', str(o.Driver))
    push('Scope', str(o.Scope))
    const ipam = (get('IPAM.Config') as { Subnet?: string; Gateway?: string }[]) || []
    push('IPAM', ipam.map((c) => [c.Subnet, c.Gateway].filter(Boolean).join(' / ')).join('\n'))
    const conts = (get('Containers') as Record<string, { Name?: string }>) || {}
    push('Containers', Object.values(conts).map((c) => str(c?.Name)).join('\n'))
  }
  return rows
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

  const toggle = document.createElement('button')
  toggle.className = 'settings-inline-btn docker-raw-toggle'
  toggle.textContent = 'Raw JSON'
  toggle.addEventListener('click', () => {
    const showRaw = pre.style.display === 'none'
    pre.style.display = showRaw ? '' : 'none'
    table.style.display = showRaw ? 'none' : ''
    toggle.textContent = showRaw ? 'Structured' : 'Raw JSON'
  })

  panel.append(toggle, table, pre)
}

// ---- tabbed detail modal (inspect / logs / terminal) --------------------

type DetailTab = 'inspect' | 'logs' | 'terminal'

// Open the rich detail modal. Containers get Inspect/Logs/Terminal (Terminal
// only when running); images/volumes/networks get Inspect only.
function showDetailModal(opts: {
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

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal docker-detail-modal'
  overlay.appendChild(modal)

  const embedded: EmbeddedTerm[] = []
  const close = (): void => {
    document.removeEventListener('keydown', onKey, true)
    embedded.forEach((t) => t.dispose())
    overlay.remove()
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
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
    const b = document.createElement('button')
    b.className = 'docker-detail-tab'
    b.dataset.tab = t.key
    b.textContent = t.label
    b.addEventListener('click', () => activate(t.key))
    tabBar.appendChild(b)
  })

  document.body.appendChild(overlay)
  activate(opts.initial && tabs.some((t) => t.key === opts.initial) ? opts.initial : tabs[0].key)
}

// ---- public entry points (mirrors database.ts) --------------------------

export function dockerApplyQuery(q: string): void {
  filter = q.trim().toLowerCase()
  applyFilter()
}

export function dockerHandleKey(_e: KeyboardEvent): void {
  // No special key handling yet; kept for parity with the other tool modes.
}

export async function renderDocker(el: HTMLElement): Promise<void> {
  host = el
  el.replaceChildren()
  el.classList.add('docker-mode')

  const avail = await dockerService.available()
  if (!avail.ok) {
    const empty = document.createElement('div')
    empty.className = 'docker-empty'
    empty.innerHTML = `<div class="docker-empty-title">Docker is not available</div><div class="docker-empty-sub">${
      avail.error || 'Start Docker Desktop and try again.'
    }</div>`
    const retry = document.createElement('button')
    retry.className = 'settings-inline-btn'
    retry.textContent = 'Retry'
    retry.addEventListener('click', () => void renderDocker(el))
    empty.appendChild(retry)
    el.appendChild(empty)
    return
  }

  const bar = document.createElement('div')
  bar.className = 'docker-subtabs'
  SUB_TABS.forEach((t) => {
    const b = document.createElement('button')
    b.className = 'docker-subtab' + (t.key === subTab ? ' active' : '')
    b.textContent = t.label
    b.addEventListener('click', () => {
      subTab = t.key
      void renderDocker(el)
    })
    bar.appendChild(b)
  })
  el.appendChild(bar)

  const list = document.createElement('div')
  list.className = 'docker-list'
  el.appendChild(list)
  list.textContent = 'Loading…'

  if (subTab === 'containers') await renderContainers(list)
  else if (subTab === 'images') await renderImages(list)
  else if (subTab === 'volumes') await renderVolumes(list)
  else if (subTab === 'networks') await renderNetworks(list)
  else await renderCompose(list)

  applyFilter()
}

function reload(): void {
  if (host) void renderDocker(host)
}

// Run a mutating action, confirm destructive ones, then reload the view.
async function act(
  kind: DockerKind | 'compose',
  action: string,
  id: string,
  label: string,
  configFile?: string
): Promise<void> {
  if (action === 'remove' || action === 'down') {
    const ok = await promptConfirm({
      title: `${action === 'down' ? 'Compose down' : 'Remove'} ${kind}`,
      message: `${action === 'down' ? 'Stop and remove' : 'Remove'} "${label}"?`,
      confirmText: action === 'down' ? 'Down' : 'Remove'
    })
    if (!ok) return
  }
  const r = await dockerService.action(kind, action, id, configFile)
  if (!r.ok) showTextModal('Action failed', r.error || 'unknown error')
  reload()
}

// ---- row helpers ---------------------------------------------------------

interface RowAction {
  label: string
  cls?: string
  run: () => void
}

function makeRow(opts: {
  title: string
  sub: string
  meta?: string
  badge?: { text: string; cls: string }
  search: string
  actions: RowAction[]
}): HTMLElement {
  const row = document.createElement('div')
  row.className = 'docker-row'
  row.dataset.search = opts.search.toLowerCase()

  const main = document.createElement('div')
  main.className = 'docker-row-main'
  const titleRow = document.createElement('div')
  titleRow.className = 'docker-row-title'
  if (opts.badge) {
    const b = document.createElement('span')
    b.className = 'docker-badge ' + opts.badge.cls
    b.textContent = opts.badge.text
    titleRow.appendChild(b)
  }
  const name = document.createElement('span')
  name.className = 'docker-row-name'
  name.textContent = opts.title
  name.title = opts.title
  titleRow.appendChild(name)
  main.appendChild(titleRow)
  const sub = document.createElement('div')
  sub.className = 'docker-row-sub'
  sub.textContent = opts.sub
  sub.title = opts.sub
  main.appendChild(sub)
  if (opts.meta) {
    const meta = document.createElement('div')
    meta.className = 'docker-row-meta'
    meta.textContent = opts.meta
    main.appendChild(meta)
  }

  const acts = document.createElement('div')
  acts.className = 'docker-row-actions'
  opts.actions.forEach((a) => {
    const b = document.createElement('button')
    b.className = 'docker-act' + (a.cls ? ' ' + a.cls : '')
    b.textContent = a.label
    b.title = a.label
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      a.run()
    })
    acts.appendChild(b)
  })

  row.append(main, acts)
  return row
}

function fillEmpty(list: HTMLElement, label: string): void {
  list.replaceChildren()
  const e = document.createElement('div')
  e.className = 'docker-empty-row'
  e.textContent = label
  list.appendChild(e)
}

// ---- per-tab renderers ---------------------------------------------------

async function renderContainers(list: HTMLElement): Promise<void> {
  const [rows] = await Promise.all([dockerService.containers()])
  list.replaceChildren()
  if (!rows.length) return fillEmpty(list, 'No containers')
  // Stats load in the background and merge in without blocking the list.
  void loadStats()
  for (const c of rows) {
    const id = f(c, 'ID')
    const name = f(c, 'Names', 'Name') || id.slice(0, 12)
    const state = f(c, 'State').toLowerCase()
    const running = state === 'running'
    const badgeCls = running ? 'ok' : state === 'paused' ? 'warn' : 'off'
    const actions: RowAction[] = []
    if (running) {
      actions.push({ label: 'Stop', run: () => void act('container', 'stop', id, name) })
      actions.push({ label: 'Restart', run: () => void act('container', 'restart', id, name) })
      actions.push({
        label: 'Exec',
        cls: 'primary',
        run: () => void openTerminalRunning(`docker exec -it ${id} sh`, `exec ${name}`)
      })
    } else {
      actions.push({
        label: 'Start',
        cls: 'primary',
        run: () => void act('container', 'start', id, name)
      })
    }
    actions.push({
      label: 'Logs',
      run: () => showDetailModal({ kind: 'container', id, name, running, initial: 'logs' })
    })
    actions.push({
      label: 'Inspect',
      run: () => showDetailModal({ kind: 'container', id, name, running, initial: 'inspect' })
    })
    actions.push({ label: 'Remove', cls: 'danger', run: () => void act('container', 'remove', id, name) })

    const row = makeRow({
      title: name,
      sub: f(c, 'Image'),
      meta: [f(c, 'Status'), f(c, 'Ports')].filter(Boolean).join('  ·  '),
      badge: { text: state || 'unknown', cls: badgeCls },
      search: `${name} ${f(c, 'Image')} ${state}`,
      actions
    })
    row.dataset.statsKey = id
    list.appendChild(row)
  }
  mergeStats()
}

async function loadStats(): Promise<void> {
  const rows = await dockerService.stats()
  stats.clear()
  for (const s of rows) {
    const id = f(s, 'ID', 'Container')
    if (id) stats.set(id, s)
  }
  mergeStats()
}

// Append CPU/MEM from the stats map onto already-rendered container rows.
function mergeStats(): void {
  if (!host) return
  host.querySelectorAll<HTMLElement>('.docker-row[data-stats-key]').forEach((row) => {
    const key = row.dataset.statsKey ?? ''
    const s = stats.get(key) || [...stats.values()].find((v) => f(v, 'ID').startsWith(key.slice(0, 12)))
    if (!s) return
    let el = row.querySelector<HTMLElement>('.docker-row-stats')
    if (!el) {
      el = document.createElement('div')
      el.className = 'docker-row-stats'
      row.querySelector('.docker-row-main')?.appendChild(el)
    }
    el.textContent = `CPU ${f(s, 'CPUPerc')}  ·  MEM ${f(s, 'MemPerc')} (${f(s, 'MemUsage')})`
  })
}

async function renderImages(list: HTMLElement): Promise<void> {
  const rows = await dockerService.images()
  list.replaceChildren()
  if (!rows.length) return fillEmpty(list, 'No images')
  for (const im of rows) {
    const id = f(im, 'ID')
    const repo = f(im, 'Repository')
    const tag = f(im, 'Tag')
    const name = repo === '<none>' ? id.slice(0, 19) : `${repo}:${tag}`
    list.appendChild(
      makeRow({
        title: name,
        sub: `${f(im, 'Size')}  ·  ${id.replace(/^sha256:/, '').slice(0, 12)}`,
        meta: f(im, 'CreatedSince'),
        search: `${name} ${id}`,
        actions: [
          {
            label: 'Inspect',
            run: () => showDetailModal({ kind: 'image', id, name })
          },
          { label: 'Remove', cls: 'danger', run: () => void act('image', 'remove', id, name) }
        ]
      })
    )
  }
  appendPrune(list, 'images', 'Prune unused images')
}

async function renderVolumes(list: HTMLElement): Promise<void> {
  const rows = await dockerService.volumes()
  list.replaceChildren()
  if (!rows.length) return fillEmpty(list, 'No volumes')
  for (const v of rows) {
    const name = f(v, 'Name')
    list.appendChild(
      makeRow({
        title: name,
        sub: `${f(v, 'Driver')}  ·  ${f(v, 'Scope')}`,
        search: name,
        actions: [
          {
            label: 'Inspect',
            run: () => showDetailModal({ kind: 'volume', id: name, name })
          },
          { label: 'Remove', cls: 'danger', run: () => void act('volume', 'remove', name, name) }
        ]
      })
    )
  }
  appendPrune(list, 'volumes', 'Prune unused volumes')
}

async function renderNetworks(list: HTMLElement): Promise<void> {
  const rows = await dockerService.networks()
  list.replaceChildren()
  if (!rows.length) return fillEmpty(list, 'No networks')
  for (const n of rows) {
    const name = f(n, 'Name')
    const id = f(n, 'ID') || name
    const builtin = ['bridge', 'host', 'none'].includes(name)
    list.appendChild(
      makeRow({
        title: name,
        sub: `${f(n, 'Driver')}  ·  ${f(n, 'Scope')}`,
        search: name,
        actions: [
          {
            label: 'Inspect',
            run: () => showDetailModal({ kind: 'network', id, name })
          },
          ...(builtin
            ? []
            : [{ label: 'Remove', cls: 'danger', run: () => void act('network', 'remove', id, name) }])
        ]
      })
    )
  }
  appendPrune(list, 'networks', 'Prune unused networks')
}

async function renderCompose(list: HTMLElement): Promise<void> {
  const rows = await dockerService.compose()
  list.replaceChildren()
  if (!rows.length) return fillEmpty(list, 'No compose projects')
  for (const p of rows) {
    const name = f(p, 'Name')
    const status = f(p, 'Status')
    const cfg = f(p, 'ConfigFiles')
    const running = /running/i.test(status)
    list.appendChild(
      makeRow({
        title: name,
        sub: status,
        meta: cfg,
        badge: { text: running ? 'up' : 'down', cls: running ? 'ok' : 'off' },
        search: `${name} ${cfg}`,
        actions: [
          { label: 'Restart', run: () => void act('compose', 'restart', name, name, cfg) },
          running
            ? { label: 'Stop', run: () => void act('compose', 'stop', name, name, cfg) }
            : { label: 'Start', cls: 'primary', run: () => void act('compose', 'start', name, name, cfg) },
          { label: 'Down', cls: 'danger', run: () => void act('compose', 'down', name, name, cfg) }
        ]
      })
    )
  }
}

function appendPrune(list: HTMLElement, target: string, label: string): void {
  const foot = document.createElement('div')
  foot.className = 'docker-list-foot'
  const btn = document.createElement('button')
  btn.className = 'settings-inline-btn'
  btn.textContent = label
  btn.addEventListener('click', async () => {
    const ok = await promptConfirm({ title: label, message: `${label}? This cannot be undone.`, confirmText: 'Prune' })
    if (!ok) return
    const r = await dockerService.prune(target)
    if (!r.ok) showTextModal('Prune failed', r.error || 'unknown error')
    reload()
  })
  foot.appendChild(btn)
  list.appendChild(foot)
}

// Hide rows that don't match the search box (shared sidebar search).
function applyFilter(): void {
  if (!host) return
  host.querySelectorAll<HTMLElement>('.docker-row').forEach((row) => {
    const hit = !filter || (row.dataset.search ?? '').includes(filter)
    row.style.display = hit ? '' : 'none'
  })
}
