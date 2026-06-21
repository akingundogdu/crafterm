import { UITexts } from '@texts'
import type { DockerKind } from '@services/docker/docker.types'
import { dockerService } from '@services'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { createButton, createOverlay } from '@ui/components'
import type { EmbeddedTerm, DetailTab, DetailModalOptions } from './detail-modal.types'
import { makeEmbeddedTerm, tabsFor, bindEscapeClose } from './detail-modal.state'
import { createInspectPanel } from './inspect-panel'

// The Docker resource detail modal: a tabbed Inspect / Logs / Terminal view.
// Containers get all three (Terminal only when running); other kinds get Inspect
// only. Logs/Terminal embed a real pty-backed xterm, disposed on close.

// Render the parsed inspect into a structured table, with a Raw JSON toggle.
function renderInspectInto(panel: HTMLElement, kind: DockerKind, raw: string): void {
  panel.replaceChildren()
  panel.appendChild(createInspectPanel(kind, raw))
}

// Open the rich detail modal. Containers get Inspect/Logs/Terminal (Terminal
// only when running); images/volumes/networks get Inspect only.
export function showDetailModal(opts: DetailModalOptions): void {
  const { kind, id, name, running } = opts
  const tabs = tabsFor(kind, running)

  const { overlay, mount, close, onClose } = createOverlay()

  const tabBar = (<div class="docker-detail-tabs" />) as HTMLDivElement
  const body = (<div class="docker-detail-body" />) as HTMLDivElement

  const modal = (
    <div class="modal docker-detail-modal">
      {makeCloseButton(close)}
      <h2 ref={(el: HTMLHeadingElement) => (el.textContent = `${name}`)} />
      {tabBar}
      {body}
    </div>
  ) as HTMLDivElement
  overlay.appendChild(modal)

  const embedded: EmbeddedTerm[] = []
  onClose(() => embedded.forEach((t) => t.dispose()))
  bindEscapeClose(close, onClose)

  // Lazily build each panel on first activation (so an unopened Terminal tab
  // never spawns a pty).
  const panels = new Map<DetailTab, HTMLElement>()
  const built = new Set<DetailTab>()
  const buildPanel = (key: DetailTab): HTMLElement => {
    const panel = (<div class="docker-detail-panel" style="display: none" />) as HTMLDivElement
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
      panel.textContent = UITexts.Docker.loading
      void dockerService.inspect(kind, id).then((raw) => renderInspectInto(panel, kind, raw))
    } else if (key === 'logs') {
      const termHost = (<div class="docker-term-host" />) as HTMLDivElement
      panel.appendChild(termHost)
      void makeEmbeddedTerm(termHost, `docker logs -f --tail 500 ${id}`).then((t) => embedded.push(t))
    } else {
      const termHost = (<div class="docker-term-host" />) as HTMLDivElement
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
