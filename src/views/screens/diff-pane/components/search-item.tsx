import { Component } from '@geajs/core'
import type { FileDiff } from '../parse-diff'

interface SearchItemOptions {
  file: FileDiff
  active: boolean
  onPick: (e: Event) => void
}

// A single file-match row in the diff search dropdown. Pure view — highlights the
// active file and forwards the (mousedown) pick to the injected handler. Data
// arrives via the constructor into plain fields (a gea Component only populates
// `this.props` when rendered from a parent template, not from a manual `new X()`).
class SearchItemView extends Component {
  private readonly file: FileDiff
  private readonly active: boolean
  private readonly onPick: (e: Event) => void

  constructor(opts: SearchItemOptions) {
    super()
    this.file = opts.file
    this.active = opts.active
    this.onPick = opts.onPick
  }

  template() {
    return (
      <div
        class={'diff-search-item' + (this.active ? ' active' : '')}
        title={this.file.path}
        onMouseDown={this.onPick}
      >
        {this.file.path}
      </div>
    )
  }
}

export function createSearchItem(opts: SearchItemOptions): HTMLDivElement {
  const host = document.createElement('div')
  new SearchItemView(opts).render(host)
  return host.firstElementChild as HTMLDivElement
}
