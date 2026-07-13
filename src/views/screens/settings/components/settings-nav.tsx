import { Component } from '@geajs/core'

// gea shell for the `.settings-nav` category list: one `.settings-nav-item` button
// per category, each wired to `show`. The active-item highlight is toggled
// imperatively by makeShow (classList on the returned navButtons), so no reactive
// store is needed. Data arrives via the constructor into fields (a manual `new X()`
// never populates `this.props`). Self-contained — no @ui.
export default class SettingsNav extends Component {
  private readonly categories: readonly string[]
  private readonly show: (cat: string) => void

  constructor(opts: { categories: readonly string[]; show: (cat: string) => void }) {
    super()
    this.categories = opts.categories
    this.show = opts.show
  }

  template() {
    return (
      <div class="settings-nav">
        {this.categories.map((c) => (
          <button key={c} class="settings-nav-item" onClick={() => this.show(c)}>
            {c}
          </button>
        ))}
      </div>
    )
  }
}

// Builds the `.settings-nav` category list wired to `show`, returning the nav
// element + per-category button map. Signature + returned shape preserved so
// openSettings / makeShow resolve unchanged.
export function createSettingsNav(
  categories: readonly string[],
  show: (cat: string) => void
): {
  nav: HTMLDivElement
  navButtons: Record<string, HTMLButtonElement>
} {
  const host = document.createElement('div')
  new SettingsNav({ categories, show }).render(host)
  const nav = host.firstElementChild as HTMLDivElement
  const btnEls = nav.querySelectorAll<HTMLButtonElement>('.settings-nav-item')
  const navButtons: Record<string, HTMLButtonElement> = {}
  categories.forEach((c, i) => {
    navButtons[c] = btnEls[i]
  })
  return { nav, navButtons }
}
