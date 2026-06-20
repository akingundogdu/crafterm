import './docker.css'
import { UITexts } from '@texts'
import { dockerService } from '@services'
import { createButton } from '@ui/components'
import { field as f } from './inspect'
import { makeRow, fillEmpty } from './components/row'
import {
  SUB_TABS,
  setDockerHost,
  setDockerRerender,
  currentSubTab,
  loadStats,
  mergeStats,
  applyFilter,
  containerActions,
  imageActions,
  volumeActions,
  networkActions,
  composeActions,
  makeSubTabClick,
  makeRetryClick,
  makePruneClick
} from './docker.state'

export { dockerApplyQuery, dockerHandleKey } from './docker.state'

// The Docker sidebar mode: containers/images/volumes/networks/compose lists with
// inline actions, a shared search filter, and a tabbed detail modal. Pure data
// (inspect tables) lives in ./inspect; the modal and rows are sibling components.
// Logic + action handlers live in docker.state; this view builds the DOM.

export async function renderDocker(el: HTMLElement): Promise<void> {
  setDockerHost(el)
  setDockerRerender(renderDocker)
  el.replaceChildren()
  el.classList.add('docker-mode')

  const avail = await dockerService.available()
  if (!avail.ok) {
    const empty = (
      <div class="docker-empty">
        <div class="docker-empty-title">Docker is not available</div>
        <div class="docker-empty-sub">{avail.error || 'Start Docker Desktop and try again.'}</div>
        {createButton({
          className: 'settings-inline-btn',
          text: UITexts.Docker.retry,
          onClick: makeRetryClick(el)
        })}
      </div>
    ) as HTMLDivElement
    el.appendChild(empty)
    return
  }

  const bar = (
    <div class="docker-subtabs">
      {SUB_TABS.map((t) =>
        createButton({
          className: 'docker-subtab' + (t.key === currentSubTab() ? ' active' : ''),
          text: t.label,
          onClick: makeSubTabClick(el, t.key)
        })
      )}
    </div>
  ) as HTMLDivElement
  el.appendChild(bar)

  const list = (<div class="docker-list" />) as HTMLDivElement
  el.appendChild(list)
  list.textContent = UITexts.Docker.loading

  const tab = currentSubTab()
  if (tab === 'containers') await renderContainers(list)
  else if (tab === 'images') await renderImages(list)
  else if (tab === 'volumes') await renderVolumes(list)
  else if (tab === 'networks') await renderNetworks(list)
  else await renderCompose(list)

  applyFilter()
}

// ---- per-tab renderers ---------------------------------------------------

async function renderContainers(list: HTMLElement): Promise<void> {
  const [rows] = await Promise.all([dockerService.containers()])
  list.replaceChildren()
  if (!rows.length) return fillEmpty(list, UITexts.Docker.empty.containers)
  // Stats load in the background and merge in without blocking the list.
  void loadStats()
  for (const c of rows) {
    const id = f(c, 'ID')
    const name = f(c, 'Names', 'Name') || id.slice(0, 12)
    const state = f(c, 'State').toLowerCase()
    const running = state === 'running'
    const badgeCls = running ? 'ok' : state === 'paused' ? 'warn' : 'off'
    const row = makeRow({
      title: name,
      sub: f(c, 'Image'),
      meta: [f(c, 'Status'), f(c, 'Ports')].filter(Boolean).join('  ·  '),
      badge: { text: state || 'unknown', cls: badgeCls },
      search: `${name} ${f(c, 'Image')} ${state}`,
      actions: containerActions(id, name, running)
    })
    row.dataset.statsKey = id
    list.appendChild(row)
  }
  mergeStats()
}

async function renderImages(list: HTMLElement): Promise<void> {
  const rows = await dockerService.images()
  list.replaceChildren()
  if (!rows.length) return fillEmpty(list, UITexts.Docker.empty.images)
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
        actions: imageActions(id, name)
      })
    )
  }
  appendPrune(list, 'images', 'Prune unused images')
}

async function renderVolumes(list: HTMLElement): Promise<void> {
  const rows = await dockerService.volumes()
  list.replaceChildren()
  if (!rows.length) return fillEmpty(list, UITexts.Docker.empty.volumes)
  for (const v of rows) {
    const name = f(v, 'Name')
    list.appendChild(
      makeRow({
        title: name,
        sub: `${f(v, 'Driver')}  ·  ${f(v, 'Scope')}`,
        search: name,
        actions: volumeActions(name)
      })
    )
  }
  appendPrune(list, 'volumes', 'Prune unused volumes')
}

async function renderNetworks(list: HTMLElement): Promise<void> {
  const rows = await dockerService.networks()
  list.replaceChildren()
  if (!rows.length) return fillEmpty(list, UITexts.Docker.empty.networks)
  for (const n of rows) {
    const name = f(n, 'Name')
    const id = f(n, 'ID') || name
    const builtin = ['bridge', 'host', 'none'].includes(name)
    list.appendChild(
      makeRow({
        title: name,
        sub: `${f(n, 'Driver')}  ·  ${f(n, 'Scope')}`,
        search: name,
        actions: networkActions(id, name, builtin)
      })
    )
  }
  appendPrune(list, 'networks', 'Prune unused networks')
}

async function renderCompose(list: HTMLElement): Promise<void> {
  const rows = await dockerService.compose()
  list.replaceChildren()
  if (!rows.length) return fillEmpty(list, UITexts.Docker.empty.compose)
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
        actions: composeActions(name, cfg, running)
      })
    )
  }
}

function appendPrune(list: HTMLElement, target: string, label: string): void {
  const foot = (
    <div class="docker-list-foot">
      {createButton({ className: 'settings-inline-btn', text: label, onClick: makePruneClick(target, label) })}
    </div>
  ) as HTMLDivElement
  list.appendChild(foot)
}
