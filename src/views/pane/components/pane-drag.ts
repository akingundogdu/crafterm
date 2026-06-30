import { el } from '@views/lib/dom'

// Visual-only drag decorations for a pane: the ⠿ grip handle inserted into the
// header and the highlighted drop overlay appended to the pane box. Pure view —
// the actual mousedown wiring lives in setupPaneDnd (pane-drag.engine).
export function createPaneGrip(): HTMLSpanElement {
  return el('span', { class: 'pane-grip', title: 'Drag to move this pane' }, '⠿')
}

export function createPaneDropOverlay(): HTMLDivElement {
  // visual-only drop indicator (its ::after draws the highlighted zone)
  return el('div', { class: 'pane-drop' })
}
