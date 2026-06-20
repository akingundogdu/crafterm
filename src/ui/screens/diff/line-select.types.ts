// Types for the shared line-selection engine used by the file/diff viewer panes.

export interface LineRow {
  className: string // full row class, e.g. 'diff-row ctx' or 'diff-row add'
  gutter: string // gutter text (line number or empty)
  text: string // line content
  line: number | null // selectable when non-null; also set as dataset.line
}

export interface LineSelectOptions {
  // File path used to build the `path:line` ref (null suppresses the send).
  refFile: () => string | null
  // Paste the ref into a terminal; returns false when none is available.
  sendRef: (ref: string) => boolean
  // Called on row mousedown so the caller can mark its pane active.
  onRowSelect: () => void
  // Extra buttons appended into the floating cluster after the "+" (e.g. comment).
  extraActions?: HTMLElement[]
  // Fired when the selection becomes empty (e.g. to dismiss a popover).
  onSelectionCleared?: () => void
}

export interface LineSelectHandle {
  body: HTMLDivElement
  setRows: (rows: LineRow[]) => void
  setMessage: (msg: string) => void
  clearSelection: () => void
  currentRange: () => { a: number; b: number } | null
  setFont: (delta: number) => void
  resetFont: () => void
  destroy: () => void
}
