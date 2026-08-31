import type { ContextMenuItem } from '@views/components/context-menu/context-menu.types'

// A modern, DATA-DRIVEN sidebar tree. Unlike the legacy `components/treeview`
// (whose adapter returns live `HTMLElement`s and needs an imperative per-frame
// dom-sync pass), this tree's consumer describes each row as plain data and the
// gea components render it. No controller, no dom-sync, no `HTMLElement` slots.

export type TreeIcon = 'project' | 'worktree' | 'folder' | 'terminal'

// Claude/session status pill tone (mirrors the legacy `.claude-*` colours).
export type StatusTone = 'in-progress' | 'question' | 'idle' | 'review' | 'test'

// Leading activity dot on a terminal row.
export type StatusDot = 'idle' | 'running' | 'attention'

export type DropPos = 'before' | 'after' | 'inside'

export interface Badge {
  kind: 'count' | 'status' | 'pin' | 'order'
  text?: string // count value / status label / order number
  tone?: StatusTone // status pill colour
  title?: string
  pulse?: boolean // attention animation (running/attention states)
  shortcut?: boolean // order number is one of the first nine (Cmd+1..9)
}

// A hover-revealed inline action button (e.g. "+ new worktree", "stop process").
export interface RowAction {
  glyph: string // a short text glyph (e.g. '+', '▶', '×') — NOT raw SVG
  title: string
  run: (e: MouseEvent) => void
}

// A sub-row rendered under the card (background process / pane / plan file).
export interface DetailRow {
  id: string
  kind: 'pane' | 'plan' | 'process' | 'text'
  label: string
  title?: string
  done?: boolean // process finished (✓ prefix)
  onClick?: (e: MouseEvent) => void // omitted for a non-interactive 'text' line
  onKill?: (e: MouseEvent) => void // process kill button
}

// A pinned node's parent breadcrumb, shown above the card.
export interface Crumb {
  text: string
  color?: string | null
}

// One row of the tree, fully described as data. Rows nest via `children`; the
// tree flattens them (respecting `collapsed`) and computes depth/guides itself.
export interface TreeRow {
  id: string
  label: string
  icon?: TreeIcon | null
  isContainer: boolean
  collapsed: boolean
  children?: TreeRow[]
  // a LEAF row that still has a disclosure toggle for its `detail` sub-rows
  // (e.g. a terminal whose plans/panes expand). Ignored for containers.
  expandable?: boolean
  expanded?: boolean
  active?: boolean // the focused terminal — filled-accent card
  multiSelected?: boolean // Cmd+click side-by-side marker
  color?: string | null // colour tag → whole-card tint
  crumb?: Crumb | null
  statusDot?: StatusDot | null
  badges?: Badge[]
  actions?: RowAction[]
  detail?: DetailRow[] // expandable sub-rows (already filtered for open/closed)
  draggable?: boolean
  renamable?: boolean
  extraClass?: string // consumer row modifier (e.g. 'worktree-archiving')
}

// A section: an optional header (plain caption or a drop-to-group target) + rows.
export interface TreeSectionData {
  id: string
  label?: string
  group?: boolean // header accepts a dropped container to set its group
  ungrouped?: boolean // the "Ungrouped" header clears the group on drop
  rows: TreeRow[]
}

// The consumer callbacks — fixed for the tree's lifetime (set at mount).
export interface TreeCallbacks {
  onSelect(id: string | null): void
  onActivate(id: string): void
  onToggle(id: string): void
  // Row click with the raw event (modifier-aware). Return true to say "handled"
  // — the tree then skips its default select + toggle/activate.
  onClick?(id: string, e: MouseEvent): boolean | void
  onRename(id: string, name: string): void
  onMove(dragId: string, targetId: string | null, pos: DropPos): void
  onColor(id: string, color: string | null): void
  onSetGroup(id: string, group: string): void
  menu(id: string): ContextMenuItem[]
  colorOf?(id: string): string | null // enables the colour swatch in the menu
  numbered?: boolean // render a per-row order number (first nine map to Cmd+1..9)
}

// The public imperative handle returned by `mountTree`.
export interface TreePanel {
  setSections(sections: TreeSectionData[]): void
  setFilter(query: string): void
  beginRename(id: string): void
  select(id: string | null): void
  selectFirst(): void
  handleKey(e: KeyboardEvent): void
  visibleIds(): string[]
  selectedId: string | null
}

// A flattened, filter-applied, top-to-bottom render item (row or header). Only
// primitives + the row data live here (the reactive store never holds DOM).
export interface FlatRow {
  kind: 'row'
  row: TreeRow
  depth: number
  guides: boolean[] // ancestor-has-following-sibling per level (for indent lines)
  isLast: boolean
  num: number // 0-based index among visible rows (drives the order number)
}
export interface FlatHeader {
  kind: 'header'
  section: TreeSectionData
}
export type FlatItem = FlatRow | FlatHeader
