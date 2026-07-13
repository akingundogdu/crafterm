import { DEFAULT_FONT, clampFont } from './line-select.store'

export interface SelectionEngineOptions {
  // The live row list (selectable rows, in order) — read by reference.
  rows: HTMLElement[]
  // Applies the current font size to the body.
  applyFont: (fontSize: number) => void
  // Fired after every selection change so the caller can reposition the cluster.
  onSelectionChange: () => void
}

export interface SelectionEngine {
  // Current selection bounds; selStart < 0 means empty.
  selStart: () => number
  selEnd: () => number
  anchor: () => number
  isDragging: () => boolean
  // Begin a drag from the given row index (sets the anchor + selects it).
  beginDrag: (idx: number) => void
  // Extend the selection from the anchor to the given row index.
  extendTo: (idx: number) => void
  // Collapse/extend to an explicit range and repaint.
  setSelection: (a: number, b: number) => void
  clearSelection: () => void
  endDrag: () => void
  setFont: (delta: number) => void
  resetFont: () => void
}

// Anchor/drag/contiguous-range selection + font scaling. The state machine is
// intentionally closure-bound here; the owning engine (createLineSelect) holds the
// single instance, so state still belongs to it. Repaints rows' `.selected` class
// and notifies the caller to reposition the floating action cluster.
export function createSelectionEngine(opts: SelectionEngineOptions): SelectionEngine {
  const rows = opts.rows
  let fontSize = DEFAULT_FONT
  let anchor = -1
  let selStart = -1
  let selEnd = -1
  let dragging = false

  opts.applyFont(fontSize)

  const refreshSelection = (): void => {
    rows.forEach((r, i) => r.classList.toggle('selected', i >= selStart && i <= selEnd))
    opts.onSelectionChange()
  }

  const setSelection = (a: number, b: number): void => {
    selStart = Math.min(a, b)
    selEnd = Math.max(a, b)
    refreshSelection()
  }

  const clearSelection = (): void => {
    anchor = selStart = selEnd = -1
    refreshSelection()
  }

  return {
    selStart: () => selStart,
    selEnd: () => selEnd,
    anchor: () => anchor,
    isDragging: () => dragging,
    beginDrag: (idx: number) => {
      anchor = idx
      dragging = true
      setSelection(idx, idx)
    },
    extendTo: (idx: number) => setSelection(anchor, idx),
    setSelection,
    clearSelection,
    endDrag: () => {
      dragging = false
    },
    setFont: (delta: number) => {
      fontSize = clampFont(fontSize, delta)
      opts.applyFont(fontSize)
    },
    resetFont: () => {
      fontSize = DEFAULT_FONT
      opts.applyFont(fontSize)
    }
  }
}
