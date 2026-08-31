import { Component } from '@geajs/core'

// A stable SVG host. Renders a single empty span and injects the SVG string as
// innerHTML in `onAfterRender` (SVG cannot be built as JSX with this runtime).
// It reads no reactive store, so it renders exactly once and is never replaced by
// its own reactivity — the glyph persists across parent re-renders. Used only as a
// single (non-map) child, never inside a `.map()` (a Component in a nested map
// mis-compiles under gea).
export default class TreeGlyph extends Component {
  declare props: { svg: string; cls?: string }
  hostEl: HTMLElement | null = null
  private started = false

  onAfterRender(): void {
    if (this.started || !this.hostEl) return
    this.started = true
    if (this.props.svg) this.hostEl.innerHTML = this.props.svg
  }

  template({ cls }: this['props']) {
    return <span class={cls} ref={this.hostEl} />
  }
}
