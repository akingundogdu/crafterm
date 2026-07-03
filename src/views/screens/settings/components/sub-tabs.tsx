import { Component } from '@geajs/core'
import type { SubTab, SubTabsOptions } from '../shared.types'

// gea SubTabs Component: a horizontal `.settings-subtabs` strip over a
// `.settings-subtab-body`, with one panel shown at a time. Each tab's `build` runs
// once, lazily, the first time its tab is shown — so the panels are empty imperative
// hosts filled after mount (no node interpolation), and the active tab + panel
// display are toggled imperatively, mirroring the legacy buildSubTabs exactly. Refs
// are assigned by gea around onAfterRender (not synchronously after render), so the
// initial tab activation runs there. Data arrives via the constructor into fields (a
// manual `new X()` never populates `this.props`). Self-contained — no @ui.
export default class SubTabs extends Component {
  private readonly tabs: SubTab[]
  private readonly opts?: SubTabsOptions

  barEl: HTMLDivElement | null = null
  bodyEl: HTMLDivElement | null = null

  private btns: HTMLButtonElement[] = []
  private panels: HTMLElement[] = []
  private built: boolean[] = []
  private started = false

  constructor(tabs: SubTab[], opts?: SubTabsOptions) {
    super()
    this.tabs = tabs
    this.opts = opts
  }

  onAfterRender(): void {
    if (this.started || !this.tabs.length) return
    this.started = true
    this.btns = Array.from(this.barEl?.querySelectorAll<HTMLButtonElement>('.settings-subtab') ?? [])
    this.panels = Array.from(this.bodyEl?.querySelectorAll<HTMLElement>('.settings-subtab-panel') ?? [])
    this.built = this.tabs.map(() => false)
    const start = this.opts?.initialIndex ?? 0
    this.show(start >= 0 && start < this.tabs.length ? start : 0)
  }

  private show = (i: number): void => {
    this.btns.forEach((b, j) => b.classList.toggle('active', j === i))
    this.panels.forEach((p, j) => (p.style.display = j === i ? 'block' : 'none'))
    if (!this.built[i]) {
      this.tabs[i].build(this.panels[i])
      this.built[i] = true
    }
    this.opts?.onTabChange?.(i)
  }

  template() {
    return (
      <div class="settings-subtabs-host">
        <div class="settings-subtabs" ref={this.barEl}>
          {this.tabs.map((t, i) => (
            <button key={String(i)} class="settings-subtab" onClick={() => this.show(i)}>
              {t.label}
            </button>
          ))}
        </div>
        <div class="settings-subtab-body" ref={this.bodyEl}>
          {this.tabs.map((_t, i) => (
            <div key={String(i)} class="settings-subtab-panel" style={{ display: 'none' }} />
          ))}
        </div>
      </div>
    )
  }
}

// Render a horizontal sub-tab strip with one body panel shown at a time. Void
// signature preserved so projects/commands controllers resolve unchanged.
export function buildSubTabs(parent: HTMLElement, tabs: SubTab[], opts?: SubTabsOptions): void {
  new SubTabs(tabs, opts).render(parent)
}
