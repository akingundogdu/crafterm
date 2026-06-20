import type { ContextMenuItem } from '../context-menu/context-menu.types'

// Reusable sidebar tree types.

export type DropPos = 'before' | 'after' | 'inside'

export type TreeMenuItem = ContextMenuItem

// One header + a list of root nodes. `render(roots)` is sugar for a single
// header-less section; terminals supply pinned/group sections explicitly.
export interface TreeSection<T> {
  header?: HTMLElement | null
  nodes: T[]
}

export interface TreeAdapter<T> {
  id(node: T): string
  label(node: T): string
  icon?(node: T): string // inline SVG html
  iconClass?(node: T): string
  leading?(node: T): HTMLElement | null // before the label (e.g. a status dot)
  trailing?(node: T): HTMLElement | null // pills/badges appended after the label
  below?(node: T): HTMLElement | null // a block appended under the row (detail/sub-rows)
  aboveRow?(node: T): HTMLElement | null // a block prepended above the row (e.g. a crumb)
  hoverActions?(node: T): HTMLElement | null // hover-revealed action buttons
  rowClass?(node: T): string
  isContainer(node: T): boolean
  children(node: T): T[]
  collapsed(node: T): boolean
  draggable?(node: T): boolean // default: containers + leaves both draggable
  renamable?(node: T): boolean
  color?(node: T): string | null // row color tag (null = none); enables the swatch row
  onColor?(node: T, color: string | null): void
  menu?(node: T): TreeMenuItem[]
  onToggle(node: T): void
  onClick?(node: T): void
  onActivate?(node: T): void // double-click / Enter on a leaf
  onRename?(node: T, name: string): void
  onMove?(dragId: string, targetId: string, pos: DropPos): void
  matches?(node: T, query: string): boolean // search override (default: label contains)
  onSelect?(node: T | null): void // keyboard/programmatic selection changed
  numbered?: boolean // render a per-row order number (first nine map to Cmd+1..9)
}

export interface TreeView<T> {
  render(roots: T[]): void
  renderSections(sections: TreeSection<T>[]): void
  setFilter(query: string): void
  handleKey(e: KeyboardEvent): void
  select(id: string | null): void
  selectFirst(): void
  beginRename(id: string): void // open the inline rename editor on a node
  visibleNodes(): T[]
  refreshDynamic(): void // re-fill leading/trailing/below slots without a rebuild
  selectedId: string | null
}

// A rendered row, kept so keyboard nav + light refresh can find it without a
// full rebuild. `slots` host the dynamic (leading/trailing/below) content.
export interface LiveRow<T> {
  node: T
  depth: number
  row: HTMLElement
  leadingHost: HTMLElement | null
  trailingHost: HTMLElement
  belowHost: HTMLElement
  numEl: HTMLElement | null
}
