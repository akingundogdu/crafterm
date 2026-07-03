import { Component } from '@geajs/core'
import type { Crumb } from '../sidebar.types'

// A single tab crumb (colored dot + label). One-shot render: the sidebar rebuilds
// the crumb whenever the tree re-renders, so no store subscription is needed. Data
// arrives via the constructor into a plain field, because a gea Component only
// populates `this.props` when rendered from a parent template, not from `new X()`.
class TabCrumb extends Component {
  private readonly crumb: Crumb

  constructor(opts: { crumb: Crumb }) {
    super()
    this.crumb = opts.crumb
  }

  template() {
    const { crumb } = this
    return (
      <div class="tab-crumb">
        <span class="crumb-dot" style={crumb.color ? { background: crumb.color } : undefined} />
        <span class="crumb-text">{crumb.text}</span>
      </div>
    )
  }
}

// Builds the crumb element for the tree adapter to insert. Signature preserved so
// tree-adapter.ts resolves unchanged.
export function buildCrumb(crumb: Crumb): HTMLElement {
  const host = document.createElement('div')
  new TabCrumb({ crumb }).render(host)
  return host.firstElementChild as HTMLElement
}
