import { Store } from '@geajs/core'

// The reactive per-tree render model. `visible` is the flattened, filter-applied,
// top-to-bottom list of what the tree shows — headers interleaved with rows. The
// JSX list child (`TreeRowList`) reads this field and re-renders on every
// reassignment (the daily-plan.store pattern: a whole-array reassign, not a bare
// rev counter, is what the gea compiler tracks). Only primitives live here — the
// row's node, slot nodes, and section-header nodes are held in plain (non-reactive)
// maps on the controller so gea never proxies a DOM node.
export interface VisibleRow {
  kind: 'row'
  id: string
  depth: number
  guides: boolean[]
  isLast: boolean
  num: number // 0-based index among visible rows (drives the optional order number)
}

export interface VisibleHeader {
  kind: 'header'
  id: string
}

export type VisibleItem = VisibleRow | VisibleHeader

export class TreeStore extends Store {
  visible: VisibleItem[] = []
  // Bumped on every (re)render. Rows/headers read+use it (`data-rev`), which keeps
  // them in gea's re-render set: a bump re-runs each row's template so its label /
  // selection / classes / indent — the reactive chrome — stay live even though the
  // row's structural props (id/depth/…) did not change. (A bare `void store.rev`
  // is NOT tracked by the gea compiler; it must be read INTO the output.)
  rev = 0
  // The node currently being inline-renamed (reactive, so the row swaps its label
  // for the edit input without any imperative DOM mutation of gea-managed nodes).
  renamingId: string | null = null

  setVisible(items: VisibleItem[]): void {
    this.visible = items
    this.rev++
  }

  setRenaming(id: string | null): void {
    this.renamingId = id
  }
}
