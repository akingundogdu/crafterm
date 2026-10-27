import type { Pane } from '@views/types/types'
import { panes, poppedOut } from '@views/state/spine'
import { pushResize } from './terminal.store'

// While a pane is popped out, its PTY runs at the pop-out window's size and the
// main window's xterm keeps receiving a mirror of the output (so docking it back
// shows what ran meanwhile). The mirrored escape sequences only draw correctly on
// a grid of the same size, so the main xterm follows the pop-out's geometry.
export function mirrorPopoutSize(id: string, cols: number, rows: number): void {
  const p = panes.get(id)
  if (!p || !poppedOut.has(id)) return
  try {
    p.term.resize(cols, rows)
  } catch {
    /* resize can throw on a disposed terminal — safe to ignore */
  }
}

// Docking back: fit the pane to its own box and push that size to the PTY even
// when the grid looks unchanged — the PTY is still at the pop-out window's size,
// and the resize is what makes a TUI (Claude, vim) redraw for the main window.
export function refitDockedPane(p: Pane): void {
  p.lastCols = 0
  p.lastRows = 0
  try {
    p.fit.fit()
  } catch {
    /* ignore — pushResize still sends the current grid */
  }
  pushResize(p)
}
