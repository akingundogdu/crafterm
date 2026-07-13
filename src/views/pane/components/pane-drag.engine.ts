import { makePaneDragMousedown } from '../pane.store'
import { createPaneGrip, createPaneDropOverlay } from './pane-drag'

// Drag-to-rearrange wiring: the header is the handle. Uses pointer events (NOT
// HTML5 drag-and-drop, which is unreliable over xterm canvases) and hit-tests
// the pane-box under the cursor each move; dropping re-lays-out the active tab.
// The actual pointer/hit-test/drop logic lives in makePaneDragMousedown
// (pane.state.ts); this assembles the visual grip + drop overlay and binds it.
export function setupPaneDnd(box: HTMLElement, header: HTMLElement, id: string): void {
  const grip = createPaneGrip()
  // Sit the grip just after the daily-task chip (when present) so the issue key
  // shows to the LEFT of the drag handle; otherwise right after the title.
  const anchor = header.querySelector('.pane-daily-chip') ?? header.querySelector('.pane-title')
  if (anchor) anchor.insertAdjacentElement('afterend', grip)
  else header.prepend(grip)

  const overlay = createPaneDropOverlay()
  box.appendChild(overlay)

  header.addEventListener('mousedown', makePaneDragMousedown(id))
}
