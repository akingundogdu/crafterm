import { Component } from '@geajs/core'
import './settings-body.css'

// gea shell for the `.settings-body` panel host: renders one empty `.settings-panel`
// per category. Each panel is an imperative host — loadSettingsPanels fills it with
// a tab's buildXxxPanel after mount (via the panels map), so the panels stay plain
// container divs (no node interpolation). makeShow toggles their display + nav-active
// state imperatively, exactly as before. Categories arrive via the constructor into
// a field (a manual `new X()` never populates `this.props`). Self-contained — no @ui.
export default class SettingsBody extends Component {
  private readonly categories: readonly string[]

  constructor(opts: { categories: readonly string[] }) {
    super()
    this.categories = opts.categories
  }

  template() {
    return (
      <div class="settings-body">
        {this.categories.map((c) => (
          <div key={c} class="settings-panel" />
        ))}
      </div>
    )
  }
}

// Builds the `.settings-body` panel host: one `.settings-panel` per category,
// returning the body element + the per-category panel map. Signature + returned
// shape preserved so openSettings / loadSettingsPanels resolve unchanged.
export function createSettingsBody(categories: readonly string[]): {
  body: HTMLDivElement
  panels: Record<string, HTMLElement>
} {
  const host = document.createElement('div')
  new SettingsBody({ categories }).render(host)
  const body = host.firstElementChild as HTMLDivElement
  const panelEls = body.querySelectorAll<HTMLElement>('.settings-panel')
  const panels: Record<string, HTMLElement> = {}
  categories.forEach((c, i) => {
    panels[c] = panelEls[i]
  })
  return { body, panels }
}

// Toggles panel display + nav-button active state for the selected category.
export function makeShow(
  categories: readonly string[],
  panels: Record<string, HTMLElement>,
  navButtons: Record<string, HTMLButtonElement>
): (cat: string) => void {
  return (cat) => {
    for (const c of categories) {
      panels[c].style.display = c === cat ? 'block' : 'none'
      navButtons[c].classList.toggle('active', c === cat)
    }
  }
}
