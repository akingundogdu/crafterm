import { Component } from '@geajs/core'

// The explorer's empty-state lines (no-root / no-matches), built as gea JSX. Tiny
// static nodes the imperative explorer render drops into the tree host.
class ExplorerEmpty extends Component {
  private readonly cls: string
  private readonly msg: string
  private readonly pad: boolean

  constructor(opts: { cls: string; msg: string; pad: boolean }) {
    super()
    this.cls = opts.cls
    this.msg = opts.msg
    this.pad = opts.pad
  }

  template() {
    return this.pad ? (
      <div class={this.cls} style={{ paddingLeft: '6px' }}>
        {this.msg}
      </div>
    ) : (
      <div class={this.cls}>{this.msg}</div>
    )
  }
}

export function buildExplorerEmpty(cls: string, msg: string, pad = false): HTMLElement {
  const host = document.createElement('div')
  new ExplorerEmpty({ cls, msg, pad }).render(host)
  return host.firstElementChild as HTMLElement
}
