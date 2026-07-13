import { Component } from '@geajs/core'

// gea shells for a terminal pane: the `.pane-box` (§5.11 thin shell — data-pane-id
// + select handler), the collapsed status line, and the inline rename input. The
// xterm mount target stays a raw document.createElement div (below) so xterm
// attaches to the exact node.
class TermPaneBox extends Component {
  private readonly paneId: string
  private readonly onSelect: (e: MouseEvent) => void

  constructor(opts: { id: string; onSelect: (e: MouseEvent) => void }) {
    super()
    this.paneId = opts.id
    this.onSelect = opts.onSelect
  }

  template() {
    return <div class="pane-box" data-pane-id={this.paneId} onMouseDown={this.onSelect} />
  }
}

class PaneStatus extends Component {
  template() {
    return <div class="pane-status" style={{ display: 'none' }} />
  }
}

class RenameInput extends Component {
  private readonly onKey: (e: KeyboardEvent) => void
  private readonly onBlurFn: () => void

  constructor(opts: { onKey: (e: KeyboardEvent) => void; onBlurFn: () => void }) {
    super()
    this.onKey = opts.onKey
    this.onBlurFn = opts.onBlurFn
  }

  template() {
    return <input class="pane-rename" onKeyDown={this.onKey} onBlur={this.onBlurFn} />
  }
}

function extract(comp: Component): HTMLElement {
  const host = document.createElement('div')
  comp.render(host)
  return host.firstElementChild as HTMLElement
}

export function buildTermHost(): HTMLDivElement {
  const host = document.createElement('div')
  host.className = 'pane-term'
  return host
}

export function buildTermBox(id: string, onSelect: (e: MouseEvent) => void): HTMLDivElement {
  return extract(new TermPaneBox({ id, onSelect })) as HTMLDivElement
}

export function buildPaneStatus(): HTMLDivElement {
  return extract(new PaneStatus()) as HTMLDivElement
}

export function buildRenameInput(onKey: (e: KeyboardEvent) => void, onBlurFn: () => void): HTMLInputElement {
  return extract(new RenameInput({ onKey, onBlurFn })) as HTMLInputElement
}
