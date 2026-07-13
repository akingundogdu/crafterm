import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { SidebarNode, ProjectNode, WorktreeNode } from '@views/types/types'
import { makeRerunClick, makeMoreClick } from '../ios-worktree.store'

// The ▶ (re-run last target) + ⋯ (action menu) buttons on an iOS worktree node.
// Static per render — the sidebar rebuilds this whenever the worktree changes — so
// no store subscription. Data arrives via the constructor into plain fields, since
// a gea Component only populates `this.props` when rendered from a parent template,
// not from a manual `new X()`.
export default class IosWorktreeActions extends Component {
  private readonly node: SidebarNode
  private readonly p: ProjectNode
  private readonly wt: WorktreeNode

  constructor(opts: { node: SidebarNode; p: ProjectNode; wt: WorktreeNode }) {
    super()
    this.node = opts.node
    this.p = opts.p
    this.wt = opts.wt
  }

  template() {
    const { node, p, wt } = this
    return (
      <span class="ios-wt-actions">
        <button
          class="ios-wt-act"
          disabled={!wt.lastRun}
          title={wt.lastRun ? `Re-run: ${wt.lastRun.name}` : 'Pick a target from the ⋯ menu first'}
          onClick={wt.lastRun ? makeRerunClick(wt, p, wt.lastRun) : undefined}
        >
          ▶
        </button>
        <button class="ios-wt-act" title={UITexts.IosWorktree.iosActions} onClick={makeMoreClick(node)}>
          ⋯
        </button>
      </span>
    )
  }
}

// Builds the ▶/⋯ action group for the sidebar to insert. Signature preserved so the
// ios-worktree.ts adapter (iosWorktreeTrailing) resolves unchanged.
export function createIosWorktreeActions(node: SidebarNode, p: ProjectNode, wt: WorktreeNode): HTMLElement {
  const host = document.createElement('span')
  new IosWorktreeActions({ node, p, wt }).render(host)
  return host.firstElementChild as HTMLElement
}
