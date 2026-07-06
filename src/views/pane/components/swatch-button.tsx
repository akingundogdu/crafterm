import { Component } from '@geajs/core'

interface SwatchButtonOptions {
  color: string | null
  onClick: () => void
  key?: string // gea list key when used as a JSX child of the pane menu
}

// A single color-swatch option in the pane menu. Pure view — paints the swatch
// (or marks it as the default/none swatch) and forwards the click. Used both as a
// JSX child of the pane menu (data via `this.props`) and via the createSwatchButton
// factory (data via the constructor field) — a gea Component only populates
// `this.props` when rendered from a parent template, not a manual `new X()`.
export default class SwatchButton extends Component {
  declare props: SwatchButtonOptions
  private readonly opts?: SwatchButtonOptions

  constructor(opts?: SwatchButtonOptions) {
    super()
    this.opts = opts
  }

  template() {
    const o = this.opts ?? this.props
    return (
      <button
        class={'context-menu-swatch' + (o.color === null ? ' context-menu-swatch-none' : '')}
        title={o.color ? undefined : 'Default'}
        style={o.color ? { background: o.color } : undefined}
        onClick={o.onClick}
      />
    )
  }
}

export function createSwatchButton(opts: SwatchButtonOptions): HTMLButtonElement {
  const host = document.createElement('div')
  new SwatchButton(opts).render(host)
  return host.firstElementChild as HTMLButtonElement
}
