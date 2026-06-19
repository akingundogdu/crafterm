import './docker.css'
import type { DockerRow, DockerKind } from '../../../../preload/api'
import { openTerminalRunning } from '../../commands'
import { promptConfirm } from '../../dialog'
import { dockerService } from '../../services/ipc'
import { createButton } from '@ui/components'
import { field as f } from './inspect'
import { showDetailModal } from './components/detail-modal'
import { showTextModal } from './components/text-modal'
import { makeRow, fillEmpty, type RowAction } from './components/row'

// The Docker sidebar mode: containers/images/volumes/networks/compose lists with
// inline actions, a shared search filter, and a tabbed detail modal. Pure data
// (inspect tables) lives in ./inspect; the modal and rows are sibling components.

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
    empty.appendChild(
      createButton({
        className: 'settings-inline-btn',
        text: 'Retry',
        onClick: () => void renderDocker(el)
      })
    )
    el.appendChild(empty)
    return
  }

  const bar = document.createElement('div')
  bar.className = 'docker-subtabs'
  SUB_TABS.forEach((t) => {
    bar.appendChild(
      createButton({
        className: 'docker-subtab' + (t.key === subTab ? ' active' : ''),
        text: t.label,
        onClick: () => {
          subTab = t.key
          void renderDocker(el)
        }
      })
    )
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
  foot.appendChild(
    createButton({
      className: 'settings-inline-btn',
      text: label,
      onClick: async () => {
        const ok = await promptConfirm({
          title: label,
          message: `${label}? This cannot be undone.`,
          confirmText: 'Prune'
        })
        if (!ok) return
        const r = await dockerService.prune(target)
        if (!r.ok) showTextModal('Prune failed', r.error || 'unknown error')
        reload()
      }
    })
  )
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
