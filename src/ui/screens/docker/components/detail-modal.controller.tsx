import { UITexts } from '@texts'
import type { DockerKind } from '@services/docker/docker.types'
import { dockerService } from '@services'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { createButton, createOverlay } from '@ui/components'
import type { EmbeddedTerm, DetailTab, DetailModalOptions } from './detail-modal.types'
import { makeEmbeddedTerm, tabsFor, bindEscapeClose } from './detail-modal.state'
import { createInspectPanel } from './inspect-panel'

// Render the parsed inspect into a structured table, with a Raw JSON toggle.
function renderInspectInto(panel: HTMLElement, kind: DockerKind, raw: string): void {
  panel.replaceChildren()
  panel.appendChild(createInspectPanel(kind, raw))
}

// The Docker resource detail modal: a tabbed Inspect / Logs / Terminal view.
// Containers get all three (Terminal only when running); other kinds get Inspect
// only. Logs/Terminal embed a real pty-backed xterm, disposed on close. The
// constructor builds + wires the modal; open() activates the initial tab.
export class DetailModalController {
  private readonly opts: DetailModalOptions
  private readonly kind: DockerKind
  private readonly id: string
  private readonly tabs: ReturnType<typeof tabsFor>

  private readonly tabBar: HTMLDivElement
  private readonly body: HTMLDivElement

  private readonly embedded: EmbeddedTerm[] = []
  // Lazily build each panel on first activation (so an unopened Terminal tab
  // never spawns a pty).
  private readonly panels = new Map<DetailTab, HTMLElement>()
  private readonly built = new Set<DetailTab>()

  private readonly mountModal: () => void

  constructor(opts: DetailModalOptions) {
    this.opts = opts
    const { kind, id, running } = opts
    this.kind = kind
    this.id = id
    this.tabs = tabsFor(kind, running)

    const { overlay, mount, close, onClose } = createOverlay()
    this.mountModal = mount

    this.tabBar = (<div class="docker-detail-tabs" />) as HTMLDivElement
    this.body = (<div class="docker-detail-body" />) as HTMLDivElement

    const modal = (
      <div class="modal docker-detail-modal">
        {makeCloseButton(close)}
        <h2 ref={(el: HTMLHeadingElement) => (el.textContent = `${opts.name}`)} />
        {this.tabBar}
        {this.body}
      </div>
    ) as HTMLDivElement
    overlay.appendChild(modal)

    onClose(() => this.embedded.forEach((t) => t.dispose()))
    bindEscapeClose(close, onClose)

    this.tabs.forEach((t) => {
      this.buildPanel(t.key)
      const b = createButton({
        className: 'docker-detail-tab',
        text: t.label,
        onClick: () => this.activate(t.key)
      })
      b.dataset.tab = t.key
      this.tabBar.appendChild(b)
    })
  }

  open(): void {
    this.mountModal()
    this.activate(
      this.opts.initial && this.tabs.some((t) => t.key === this.opts.initial) ? this.opts.initial : this.tabs[0].key
    )
  }

  private buildPanel = (key: DetailTab): HTMLElement => {
    const panel = (<div class="docker-detail-panel" style="display: none" />) as HTMLDivElement
    this.body.appendChild(panel)
    this.panels.set(key, panel)
    return panel
  }

  private activate = (key: DetailTab): void => {
    this.tabBar.querySelectorAll('.docker-detail-tab').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.tab === key)
    })
    this.panels.forEach((p, k) => {
      p.style.display = k === key ? '' : 'none'
    })
    if (this.built.has(key)) return
    this.built.add(key)
    const panel = this.panels.get(key)!
    if (key === 'inspect') {
      panel.textContent = UITexts.Docker.loading
      void dockerService.inspect(this.kind, this.id).then((raw) => renderInspectInto(panel, this.kind, raw))
    } else if (key === 'logs') {
      const termHost = (<div class="docker-term-host" />) as HTMLDivElement
      panel.appendChild(termHost)
      void makeEmbeddedTerm(termHost, `docker logs -f --tail 500 ${this.id}`).then((t) => this.embedded.push(t))
    } else {
      const termHost = (<div class="docker-term-host" />) as HTMLDivElement
      panel.appendChild(termHost)
      void makeEmbeddedTerm(termHost, `docker exec -it ${this.id} sh`).then((t) => this.embedded.push(t))
    }
  }
}
