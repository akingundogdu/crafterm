import type { ContextMenuItem } from '../context-menu/context-menu.types'
import type { TreeStore } from './treeview.store'

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
// full rebuild. Its DOM refs (`row` + slot hosts) start null and are filled by
// the row's gea Component when it mounts (`onAfterRender`); the ordered `live`
// list itself is pre-built from the flattened visible model so keyboard nav /
// numbering see rows in visual order regardless of mount timing.
export interface LiveRow<T> {
  node: T
  depth: number
  row: HTMLElement | null
  leadingHost: HTMLElement | null
  trailingHost: HTMLElement | null
  belowHost: HTMLElement | null
  numEl: HTMLElement | null
}

// Shared mutable context handed to every extracted treeview piece. The state
// itself stays inside the controller; this object only exposes typed
// getters/setters + the cross-piece callbacks + the plain (non-reactive) lookup
// maps the gea row/header Components read by id, so the controller remains the
// single source of truth.
export interface TreeContext<T> {
  host: HTMLElement
  a: TreeAdapter<T>
  view: TreeView<T>
  // plain lookup maps (never reactive — DOM nodes/nodes kept off the gea store)
  nodeById: Map<string, T>
  headerById: Map<string, HTMLElement>
  liveById: Map<string, LiveRow<T>>
  // mutable state accessors
  getDragId(): string | null
  setDragId(id: string | null): void
  isRenaming(): boolean
  setRenaming(id: string | null): void
  getFilter(): string
  setFilter(value: string): void
  getLive(): LiveRow<T>[]
  setLive(rows: LiveRow<T>[]): void
  getLastSections(): TreeSection<T>[]
  setLastSections(sections: TreeSection<T>[]): void
  // cross-piece callbacks (wired in the controller)
  select(id: string | null): void
  rerender(): void
  startRename(node: T): void
  clearDropMarks(): void
}

// Per-instance render runtime, looked up from the module registry by a string
// `storeId` so a gea child Component can read the genuine reactive store proxy
// (tracking fires on the proxy get regardless of how the reference was reached)
// without a store/DOM node ever crossing a proxied prop.
export interface TreeRuntime<T> {
  store: TreeStore
  ctx: TreeContext<T>
}
