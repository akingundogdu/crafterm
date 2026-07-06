import { Component } from '@geajs/core'

interface MenuItemOptions {
  label: string
  onClick: () => void
  key?: string // gea list key when used as a JSX child of the pane menu
}

// A single action button in the pane menu. Pure view — forwards the click. Used
// two ways: as a JSX child of the pane menu (data via `this.props`) and via the
// createMenuItem factory (data via the constructor field) — a gea Component only
// populates `this.props` when rendered from a parent template, not a manual
// `new X()`, so the template reads whichever is present.
export default class MenuItem extends Component {
  declare props: MenuItemOptions
  private readonly opts?: MenuItemOptions

  constructor(opts?: MenuItemOptions) {
    super()
    this.opts = opts
  }

  template() {
    const o = this.opts ?? this.props
    return <button onClick={o.onClick}>{o.label}</button>
  }
}

export function createMenuItem(opts: MenuItemOptions): HTMLButtonElement {
  const host = document.createElement('div')
  new MenuItem(opts).render(host)
  return host.firstElementChild as HTMLButtonElement
}
