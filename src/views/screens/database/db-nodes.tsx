import { Component } from '@geajs/core'

// Small static nodes for the database tree, built as gea JSX: a section count /
// status pill and the empty-connections hint. The imperative database render
// drops these into the tree host.
class DbPill extends Component {
  private readonly cls: string
  private readonly txt: string

  constructor(opts: { cls: string; txt: string }) {
    super()
    this.cls = opts.cls
    this.txt = opts.txt
  }

  template() {
    return <span class={this.cls}>{this.txt}</span>
  }
}

class DbEmpty extends Component {
  private readonly msg: string

  constructor(opts: { msg: string }) {
    super()
    this.msg = opts.msg
  }

  template() {
    return <div class="empty-hint">{this.msg}</div>
  }
}

export function buildPill(cls: string, text: string): HTMLElement {
  const host = document.createElement('div')
  new DbPill({ cls, txt: text }).render(host)
  return host.firstElementChild as HTMLElement
}

export function buildDbEmpty(msg: string): HTMLElement {
  const host = document.createElement('div')
  new DbEmpty({ msg }).render(host)
  return host.firstElementChild as HTMLElement
}
