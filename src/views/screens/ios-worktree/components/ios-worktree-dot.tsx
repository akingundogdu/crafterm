import { Component } from '@geajs/core'
import { dotInfo } from '../ios-worktree.store'

// Live iOS build-status dot for a worktree node (building/running/installed/…).
// State is a one-shot read of dotInfo() at mount time — the sidebar rebuilds the
// node (and this component) whenever the status changes — so no store subscription
// is needed. Data arrives via the constructor into a plain field, because a gea
// Component only populates `this.props` when rendered from a parent template, not
// from a manual `new X()`.
export default class IosWorktreeDot extends Component {
  private readonly worktreePath: string

  constructor(opts: { worktreePath: string }) {
    super()
    this.worktreePath = opts.worktreePath
  }

  template() {
    const st = dotInfo(this.worktreePath)
    return <span class={`ios-wt-dot ios-wt-dot-${st.cls}`} title={st.title} />
  }
}

// Builds the status-dot element for the sidebar to insert. Signature preserved so
// the ios-worktree.ts adapter (iosWorktreeDot) resolves unchanged.
export function createIosWorktreeDot(worktreePath: string): HTMLElement {
  const host = document.createElement('span')
  new IosWorktreeDot({ worktreePath }).render(host)
  return host.firstElementChild as HTMLElement
}
