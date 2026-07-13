import { Store } from '@geajs/core'
import type { DropPos, TreeAdapter } from './treeview.types'

export const INDENT = 14
export const CHEVRON =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>'

// Tint a row by its color tag (reuses the terminal sidebar's .has-color vars).
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return 'transparent'
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`
}

export function applyRowColor(row: HTMLElement, color: string | null): void {
  if (!color) return
  row.classList.add('has-color')
  row.style.setProperty('--row-color', color)
  row.style.setProperty('--row-tint', hexToRgba(color, 0.085))
}

// ---- search ----------------------------------------------------------------

function nodeMatches<T>(a: TreeAdapter<T>, node: T, q: string): boolean {
  if (a.matches) return a.matches(node, q)
  return a.label(node).toLowerCase().includes(q)
}

export function subtreeMatches<T>(a: TreeAdapter<T>, node: T, q: string): boolean {
  if (nodeMatches(a, node, q)) return true
  return a.isContainer(node) && a.children(node).some((c) => subtreeMatches(a, c, q))
}

// ---- drag-drop zones -------------------------------------------------------

// top third = before, bottom third = after, middle = inside (containers only)
export function zoneFor(e: DragEvent, row: HTMLElement, container: boolean): DropPos {
  const r = row.getBoundingClientRect()
  const y = (e.clientY - r.top) / r.height
  if (container) {
    if (y < 0.3) return 'before'
    if (y > 0.7) return 'after'
    return 'inside'
  }
  return y < 0.5 ? 'before' : 'after'
}

// map zone → existing CSS class names
export function dropClass(pos: DropPos): string {
  return pos === 'inside' ? 'drag-into' : 'drag-' + pos
}

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
