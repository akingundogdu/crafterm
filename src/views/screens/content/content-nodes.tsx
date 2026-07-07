import { Component } from '@geajs/core'

// The content area's structural containers (pane box, split, resizer, resize
// overlay, tab container) are class-only `<div>`s the imperative layout engine
// builds and positions. This gea factory produces them as JSX.
class ContentBox extends Component {
  private readonly cls: string

  constructor(opts: { cls: string }) {
    super()
    this.cls = opts.cls
  }

  template() {
    return <div class={this.cls} />
  }
}

export function buildContentBox(cls: string): HTMLElement {
  const host = document.createElement('div')
  new ContentBox({ cls }).render(host)
  return host.firstElementChild as HTMLElement
}
