import { UITexts } from '@texts'
import type { DockerRow, DockerKind } from '@services/docker/docker.types'
import { openTerminalRunning } from '@ui/commands/commands'
import { promptConfirm } from '@ui/components/dialog/dialog'
import { dockerService } from '@services'
import { field as f } from './inspect'
import { showDetailModal } from './components/detail-modal'
import { showTextModal } from './components/text-modal'
import type { RowAction } from './components/row'
import type { SubTab } from './docker.types'

export const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'containers', label: UITexts.Docker.tabs.containers },
  { key: 'images', label: UITexts.Docker.tabs.images },
  { key: 'volumes', label: UITexts.Docker.tabs.volumes },
  { key: 'networks', label: UITexts.Docker.tabs.networks },
  { key: 'compose', label: UITexts.Docker.tabs.compose }
]

let host: HTMLElement | null = null
let subTab: SubTab = 'containers'
let filter = ''
const stats = new Map<string, DockerRow>() // container id/name -> live stats row
// Injected by the view to break the state→view cycle (reload re-renders).
let rerender: ((el: HTMLElement) => void) | null = null

export function setDockerHost(el: HTMLElement): void {
  host = el
}
export function setDockerRerender(fn: (el: HTMLElement) => void): void {
  rerender = fn
}
export function currentSubTab(): SubTab {
  return subTab
}
export function setSubTab(t: SubTab): void {
  subTab = t
}

// ---- public entry points (mirrors database.ts) --------------------------

export function dockerApplyQuery(q: string): void {
  filter = q.trim().toLowerCase()
  applyFilter()
}

export function dockerHandleKey(_e: KeyboardEvent): void {
  // No special key handling yet; kept for parity with the other tool modes.
}

function reload(): void {
  if (host && rerender) rerender(host)
}

// Run a mutating action, confirm destructive ones, then reload the view.
export async function act(
  kind: DockerKind | 'compose',
  action: string,
  id: string,
  label: string,
  configFile?: string
): Promise<void> {
  if (action === 'remove' || action === 'down') {
    const ok = await promptConfirm({
      title: `${action === 'down' ? UITexts.Docker.confirm.composeDown : UITexts.Docker.confirm.remove} ${kind}`,
      message: `${action === 'down' ? UITexts.Docker.confirm.stopAndRemove : UITexts.Docker.confirm.remove} "${label}"?`,
      confirmText: action === 'down' ? UITexts.Docker.confirm.down : UITexts.Docker.confirm.remove
    })
    if (!ok) return
  }
  const r = await dockerService.action(kind, action, id, configFile)
  if (!r.ok) showTextModal(UITexts.Docker.actionFailed, r.error || UITexts.Docker.unknownError)
  reload()
}

export async function loadStats(): Promise<void> {
  const rows = await dockerService.stats()
  stats.clear()
  for (const s of rows) {
    const id = f(s, 'ID', 'Container')
    if (id) stats.set(id, s)
  }
  mergeStats()
}

// Append CPU/MEM from the stats map onto already-rendered container rows.
export function mergeStats(): void {
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

// Hide rows that don't match the search box (shared sidebar search).
export function applyFilter(): void {
  if (!host) return
  host.querySelectorAll<HTMLElement>('.docker-row').forEach((row) => {
    const hit = !filter || (row.dataset.search ?? '').includes(filter)
    row.style.display = hit ? '' : 'none'
  })
}

// ---- action lists (carry the row action handlers) -----------------------

export function containerActions(id: string, name: string, running: boolean): RowAction[] {
  const actions: RowAction[] = []
  if (running) {
    actions.push({ label: UITexts.Docker.actions.stop, run: () => void act('container', 'stop', id, name) })
    actions.push({ label: UITexts.Docker.actions.restart, run: () => void act('container', 'restart', id, name) })
    actions.push({
      label: UITexts.Docker.actions.exec,
      cls: 'primary',
      run: () => void openTerminalRunning(`docker exec -it ${id} sh`, `exec ${name}`)
    })
  } else {
    actions.push({
      label: UITexts.Docker.actions.start,
      cls: 'primary',
      run: () => void act('container', 'start', id, name)
    })
  }
  actions.push({
    label: UITexts.Docker.actions.logs,
    run: () => showDetailModal({ kind: 'container', id, name, running, initial: 'logs' })
  })
  actions.push({
    label: UITexts.Docker.actions.inspect,
    run: () => showDetailModal({ kind: 'container', id, name, running, initial: 'inspect' })
  })
  actions.push({ label: UITexts.Docker.actions.remove, cls: 'danger', run: () => void act('container', 'remove', id, name) })
  return actions
}

export function imageActions(id: string, name: string): RowAction[] {
  return [
    { label: UITexts.Docker.actions.inspect, run: () => showDetailModal({ kind: 'image', id, name }) },
    { label: UITexts.Docker.actions.remove, cls: 'danger', run: () => void act('image', 'remove', id, name) }
  ]
}

export function volumeActions(name: string): RowAction[] {
  return [
    { label: UITexts.Docker.actions.inspect, run: () => showDetailModal({ kind: 'volume', id: name, name }) },
    { label: UITexts.Docker.actions.remove, cls: 'danger', run: () => void act('volume', 'remove', name, name) }
  ]
}

export function networkActions(id: string, name: string, builtin: boolean): RowAction[] {
  return [
    { label: UITexts.Docker.actions.inspect, run: () => showDetailModal({ kind: 'network', id, name }) },
    ...(builtin
      ? []
      : [{ label: UITexts.Docker.actions.remove, cls: 'danger', run: () => void act('network', 'remove', id, name) }])
  ]
}

export function composeActions(name: string, cfg: string, running: boolean): RowAction[] {
  return [
    { label: UITexts.Docker.actions.restart, run: () => void act('compose', 'restart', name, name, cfg) },
    running
      ? { label: UITexts.Docker.actions.stop, run: () => void act('compose', 'stop', name, name, cfg) }
      : { label: UITexts.Docker.actions.start, cls: 'primary', run: () => void act('compose', 'start', name, name, cfg) },
    { label: UITexts.Docker.actions.down, cls: 'danger', run: () => void act('compose', 'down', name, name, cfg) }
  ]
}

// ---- handler factories ---------------------------------------------------

export function makeSubTabClick(el: HTMLElement, key: SubTab): () => void {
  return () => {
    setSubTab(key)
    rerender?.(el)
  }
}

export function makeRetryClick(el: HTMLElement): () => void {
  return () => rerender?.(el)
}

export function makePruneClick(target: string, label: string): () => Promise<void> {
  return async () => {
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
}
