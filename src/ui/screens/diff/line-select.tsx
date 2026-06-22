import type { LineSelectOptions, LineSelectHandle } from './line-select.types'
import { LineSelectController } from './line-select.controller'

export type { LineRow, LineSelectOptions, LineSelectHandle } from './line-select.types'

// Shared line-selection engine for the read-only file/diff viewer panes. Owns the
// `.diff-body` element, the rendered rows, contiguous range selection
// (click / click-drag / shift-click), font scaling, and the floating action
// cluster whose "+" pastes a `path:line[-line]` reference into a terminal.
//
// Pure: it imports no state/IPC — the app touchpoints (which file the ref names,
// how to paste it, pane selection) arrive via opts, so the engine renders and
// selects under happy-dom without the renderer graph. Callers (file-pane,
// diff-pane) supply the row list and wire the injected callbacks. The selection
// state machine is intentionally closure-bound; pure helpers live in state.
export function createLineSelect(opts: LineSelectOptions): LineSelectHandle {
  return new LineSelectController(opts).build()
}
