import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { DockerKind } from '@services/docker/docker.types'
import { dockerService } from '@services'
import { createOverlay } from '@views/components/overlay/overlay'
import type { EmbeddedTerm, DetailTab, DetailModalOptions } from './detail-modal.types'
import { makeEmbeddedTerm, tabsFor, bindEscapeClose } from './detail-modal.store'
import InspectPanel from './inspect-panel'

// Open the rich detail modal. Containers get Inspect/Logs/Terminal (Terminal
// only when running); images/volumes/networks get Inspect only. Signature
// preserved so docker.store consumers resolve unchanged.
export function showDetailModal(opts: DetailModalOptions): void {
  const ov = createOverlay()
  const comp = new DetailModal({ ...opts, onClose: () => ov.close() })
  comp.render(ov.overlay)
  ov.onClose(() => comp.dispose())
  bindEscapeClose(ov.close, ov.onClose)
  ov.mount()
}

// The Docker resource detail modal: a tabbed Inspect / Logs / Terminal view.
// Containers get all three (Terminal only when running); other kinds get Inspect
// only. Logs/Terminal embed a real pty-backed xterm, disposed on close. gea
// Component (§2.7): static props via constructor fields (a manual `new X()` never
// populates `this.props`); the template lays out the tab bar + empty panels, and
// the genuinely imperative work — lazy panel construction, pty spawning, tab
// activation — runs against element refs after mount. There are no reactive reads,
// so the component renders exactly once and the imperatively injected content
// (xterms, inspect panel) is never clobbered by a re-render.
export default class DetailModal extends Component {
  private readonly heading: string
  private readonly kind: DockerKind
  private readonly resourceId: string
  private readonly initial?: DetailTab
  private readonly tabs: { key: DetailTab; label: string }[]
  private readonly onCloseFn: () => void

  private readonly embedded: EmbeddedTerm[] = []
  // Lazily build each panel on first activation (so an unopened Terminal tab
  // never spawns a pty).
  private readonly built = new Set<DetailTab>()

  tabBarEl: HTMLDivElement | null = null
  bodyEl: HTMLDivElement | null = null

  constructor(opts: DetailModalOptions & { onClose: () => void }) {
    super()
    this.heading = opts.name
    this.kind = opts.kind
    this.resourceId = opts.id
    this.initial = opts.initial
    this.tabs = tabsFor(opts.kind, opts.running)
    this.onCloseFn = opts.onClose
  }

  private started = false

  dispose(): void {
    this.embedded.forEach((t) => t.dispose())
  }

  // Refs (tabBarEl/bodyEl) are assigned by gea around onAfterRender, NOT
  // synchronously after render(), so the initial tab activation must run here
  // (calling it right after render() would find null refs and build no panel).
  onAfterRender(): void {
    if (this.started) return
    this.started = true
    this.openInitial()
  }

  // Activate the initial tab once the modal is mounted (matches the legacy open()).
  openInitial(): void {
    this.activate(
      this.initial && this.tabs.some((t) => t.key === this.initial) ? this.initial : this.tabs[0].key
    )
  }

  private activate = (key: DetailTab): void => {
    this.tabBarEl?.querySelectorAll('.docker-detail-tab').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.tab === key)
    })
    this.bodyEl?.querySelectorAll('.docker-detail-panel').forEach((p) => {
      ;(p as HTMLElement).style.display = (p as HTMLElement).dataset.tab === key ? '' : 'none'
    })
    if (this.built.has(key)) return
    this.built.add(key)
    const panel = this.bodyEl?.querySelector(`.docker-detail-panel[data-tab="${key}"]`) as HTMLElement | null
    if (!panel) return
    if (key === 'inspect') {
      panel.textContent = UITexts.Docker.loading
      void dockerService.inspect(this.kind, this.resourceId).then((raw) => {
        panel.replaceChildren()
        new InspectPanel({ kind: this.kind, raw }).render(panel)
      })
    } else if (key === 'logs') {
      const termHost = document.createElement('div')
      termHost.className = 'docker-term-host'
      panel.appendChild(termHost)
      void makeEmbeddedTerm(termHost, `docker logs -f --tail 500 ${this.resourceId}`).then((t) => this.embedded.push(t))
    } else {
      const termHost = document.createElement('div')
      termHost.className = 'docker-term-host'
      panel.appendChild(termHost)
      void makeEmbeddedTerm(termHost, `docker exec -it ${this.resourceId} sh`).then((t) => this.embedded.push(t))
    }
  }

  template() {
    return (
      <div class="modal docker-detail-modal">
        <button
          class="modal-close"
          type="button"
          aria-label="Close"
          title="Close (Esc)"
          onClick={() => this.onCloseFn()}
        >
          ×
        </button>
        <h2>{this.heading}</h2>
        <div class="docker-detail-tabs" ref={this.tabBarEl}>
          {this.tabs.map((t) => (
            <button
              key={t.key}
              class="docker-detail-tab"
              type="button"
              data-tab={t.key}
              onClick={() => this.activate(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div class="docker-detail-body" ref={this.bodyEl}>
          {this.tabs.map((t) => (
            <div key={t.key} class="docker-detail-panel" data-tab={t.key} style={{ display: 'none' }} />
          ))}
        </div>
      </div>
    )
  }
}
