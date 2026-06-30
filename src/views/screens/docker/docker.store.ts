import { Store } from '@geajs/core'
import { UITexts } from '@texts'
import { dockerService } from '@services'
import type { DockerRow, DockerKind } from '@services/docker/docker.types'
import { openTerminalRunning } from '@views/commands/commands'
import { promptConfirm } from '@views/components/dialog/confirm'
import { field as f } from './inspect'
import type { SubTab, RowVM, RowAction } from './docker.types'
import { showDetailModal } from './components/detail-modal'
import { showTextModal } from './components/text-modal'

export const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'containers', label: UITexts.Docker.tabs.containers },
  { key: 'images', label: UITexts.Docker.tabs.images },
  { key: 'volumes', label: UITexts.Docker.tabs.volumes },
  { key: 'networks', label: UITexts.Docker.tabs.networks },
  { key: 'compose', label: UITexts.Docker.tabs.compose }
]

const EMPTY_LABEL: Record<SubTab, string> = {
  containers: UITexts.Docker.empty.containers,
  images: UITexts.Docker.empty.images,
  volumes: UITexts.Docker.empty.volumes,
  networks: UITexts.Docker.empty.networks,
  compose: UITexts.Docker.empty.compose
}

const PRUNE_LABEL: Partial<Record<SubTab, { target: string; label: string }>> = {
  images: { target: 'images', label: 'Prune unused images' },
  volumes: { target: 'volumes', label: 'Prune unused volumes' },
  networks: { target: 'networks', label: 'Prune unused networks' }
}

// Reactive state for the gea Docker panel. dockerService stays the source of
// truth; this store mirrors the active tab's rows into a reactive VM array so gea
// patches the list on mutation, replacing the legacy renderDocker()/applyFilter()
// /mergeStats() DOM-patching cycle. `query` holds the lowercased search filter
// (driven by the shared sidebar search box via the legacy entry shim).
class DockerStore extends Store {
  available: boolean | null = null
  availError = ''
  subTab: SubTab = 'containers'
  query = ''
  loading = false
  rows: RowVM[] = []
  statsByKey: Record<string, DockerRow> = {}

  // --- view-state mutations ---
  setQuery(q: string): void {
    this.query = q.trim().toLowerCase()
  }

  setSubTab(t: SubTab): void {
    if (t === this.subTab) return
    this.subTab = t
    void this.reload()
  }

  get filtered(): RowVM[] {
    const q = this.query
    return q ? this.rows.filter((r) => r.search.includes(q)) : this.rows
  }

  get emptyLabel(): string {
    return EMPTY_LABEL[this.subTab]
  }

  get pruneFooter(): { target: string; label: string } | null {
    return PRUNE_LABEL[this.subTab] ?? null
  }

  // Append CPU/MEM text for an already-rendered container row from the live stats
  // map (rows are keyed by container id; fall back to a short-id prefix match).
  statsText(key: string): string {
    const s =
      this.statsByKey[key] || Object.values(this.statsByKey).find((v) => f(v, 'ID').startsWith(key.slice(0, 12)))
    if (!s) return ''
    return `CPU ${f(s, 'CPUPerc')}  ·  MEM ${f(s, 'MemPerc')} (${f(s, 'MemUsage')})`
  }

  // --- data loading ---
  async reload(): Promise<void> {
    this.loading = true
    this.rows = []
    this.statsByKey = {}
    const avail = await dockerService.available()
    if (!avail.ok) {
      this.available = false
      this.availError = avail.error ?? ''
      this.loading = false
      return
    }
    this.available = true
    const tab = this.subTab
    if (tab === 'containers') await this.loadContainers()
    else if (tab === 'images') await this.loadImages()
    else if (tab === 'volumes') await this.loadVolumes()
    else if (tab === 'networks') await this.loadNetworks()
    else await this.loadCompose()
    this.loading = false
  }

  retry(): void {
    void this.reload()
  }

  private async loadContainers(): Promise<void> {
    const list = await dockerService.containers()
    this.rows = list.map((c) => {
      const id = f(c, 'ID')
      const name = f(c, 'Names', 'Name') || id.slice(0, 12)
      const state = f(c, 'State').toLowerCase()
      const running = state === 'running'
      const badgeCls = running ? 'ok' : state === 'paused' ? 'warn' : 'off'
      return {
        id,
        title: name,
        sub: f(c, 'Image'),
        meta: [f(c, 'Status'), f(c, 'Ports')].filter(Boolean).join('  ·  '),
        badge: { text: state || 'unknown', cls: badgeCls },
        search: `${name} ${f(c, 'Image')} ${state}`.toLowerCase(),
        statsKey: id,
        actions: this.containerActions(id, name, running)
      }
    })
    // Stats load in the background and merge in reactively (no list re-fetch).
    void this.loadStats()
  }

  private async loadImages(): Promise<void> {
    const list = await dockerService.images()
    this.rows = list.map((im) => {
      const id = f(im, 'ID')
      const repo = f(im, 'Repository')
      const tag = f(im, 'Tag')
      const name = repo === '<none>' ? id.slice(0, 19) : `${repo}:${tag}`
      return {
        id,
        title: name,
        sub: `${f(im, 'Size')}  ·  ${id.replace(/^sha256:/, '').slice(0, 12)}`,
        meta: f(im, 'CreatedSince'),
        search: `${name} ${id}`.toLowerCase(),
        actions: this.imageActions(id, name)
      }
    })
  }

  private async loadVolumes(): Promise<void> {
    const list = await dockerService.volumes()
    this.rows = list.map((v) => {
      const name = f(v, 'Name')
      return {
        id: name,
        title: name,
        sub: `${f(v, 'Driver')}  ·  ${f(v, 'Scope')}`,
        search: name.toLowerCase(),
        actions: this.volumeActions(name)
      }
    })
  }

  private async loadNetworks(): Promise<void> {
    const list = await dockerService.networks()
    this.rows = list.map((n) => {
      const name = f(n, 'Name')
      const id = f(n, 'ID') || name
      const builtin = ['bridge', 'host', 'none'].includes(name)
      return {
        id,
        title: name,
        sub: `${f(n, 'Driver')}  ·  ${f(n, 'Scope')}`,
        search: name.toLowerCase(),
        actions: this.networkActions(id, name, builtin)
      }
    })
  }

  private async loadCompose(): Promise<void> {
    const list = await dockerService.compose()
    this.rows = list.map((p) => {
      const name = f(p, 'Name')
      const status = f(p, 'Status')
      const cfg = f(p, 'ConfigFiles')
      const running = /running/i.test(status)
      return {
        id: name,
        title: name,
        sub: status,
        meta: cfg,
        badge: { text: running ? 'up' : 'down', cls: running ? 'ok' : 'off' },
        search: `${name} ${cfg}`.toLowerCase(),
        actions: this.composeActions(name, cfg, running)
      }
    })
  }

  private async loadStats(): Promise<void> {
    const rows = await dockerService.stats()
    const map: Record<string, DockerRow> = {}
    for (const s of rows) {
      const id = f(s, 'ID', 'Container')
      if (id) map[id] = s
    }
    this.statsByKey = map
  }

  // --- mutating actions (persisted, then reload) ---
  // Run a mutating action, confirm destructive ones, then reload the view.
  async act(kind: DockerKind | 'compose', action: string, id: string, label: string, configFile?: string): Promise<void> {
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
    void this.reload()
  }

  async prune(target: string, label: string): Promise<void> {
    const ok = await promptConfirm({ title: label, message: `${label}? This cannot be undone.`, confirmText: 'Prune' })
    if (!ok) return
    const r = await dockerService.prune(target)
    if (!r.ok) showTextModal('Prune failed', r.error || 'unknown error')
    void this.reload()
  }

  // --- action lists (carry the row action handlers) ---
  private containerActions(id: string, name: string, running: boolean): RowAction[] {
    const actions: RowAction[] = []
    if (running) {
      actions.push({ label: UITexts.Docker.actions.stop, run: () => void this.act('container', 'stop', id, name) })
      actions.push({ label: UITexts.Docker.actions.restart, run: () => void this.act('container', 'restart', id, name) })
      actions.push({
        label: UITexts.Docker.actions.exec,
        cls: 'primary',
        run: () => void openTerminalRunning(`docker exec -it ${id} sh`, `exec ${name}`)
      })
    } else {
      actions.push({
        label: UITexts.Docker.actions.start,
        cls: 'primary',
        run: () => void this.act('container', 'start', id, name)
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
    actions.push({
      label: UITexts.Docker.actions.remove,
      cls: 'danger',
      run: () => void this.act('container', 'remove', id, name)
    })
    return actions
  }

  private imageActions(id: string, name: string): RowAction[] {
    return [
      { label: UITexts.Docker.actions.inspect, run: () => showDetailModal({ kind: 'image', id, name }) },
      { label: UITexts.Docker.actions.remove, cls: 'danger', run: () => void this.act('image', 'remove', id, name) }
    ]
  }

  private volumeActions(name: string): RowAction[] {
    return [
      { label: UITexts.Docker.actions.inspect, run: () => showDetailModal({ kind: 'volume', id: name, name }) },
      { label: UITexts.Docker.actions.remove, cls: 'danger', run: () => void this.act('volume', 'remove', name, name) }
    ]
  }

  private networkActions(id: string, name: string, builtin: boolean): RowAction[] {
    return [
      { label: UITexts.Docker.actions.inspect, run: () => showDetailModal({ kind: 'network', id, name }) },
      ...(builtin
        ? []
        : [
            {
              label: UITexts.Docker.actions.remove,
              cls: 'danger',
              run: () => void this.act('network', 'remove', id, name)
            }
          ])
    ]
  }

  private composeActions(name: string, cfg: string, running: boolean): RowAction[] {
    return [
      { label: UITexts.Docker.actions.restart, run: () => void this.act('compose', 'restart', name, name, cfg) },
      running
        ? { label: UITexts.Docker.actions.stop, run: () => void this.act('compose', 'stop', name, name, cfg) }
        : {
            label: UITexts.Docker.actions.start,
            cls: 'primary',
            run: () => void this.act('compose', 'start', name, name, cfg)
          },
      { label: UITexts.Docker.actions.down, cls: 'danger', run: () => void this.act('compose', 'down', name, name, cfg) }
    ]
  }
}

export default new DockerStore()
