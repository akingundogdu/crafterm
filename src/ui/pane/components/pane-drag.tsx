// Visual-only drag decorations for a pane: the ⠿ grip handle inserted into the
// header and the highlighted drop overlay appended to the pane box. Pure view —
// the actual mousedown wiring lives in setupPaneDnd (pane.tsx).
export function createPaneGrip(): HTMLSpanElement {
  return (
    <span class="pane-grip" title="Drag to move this pane">
      ⠿
    </span>
  ) as HTMLSpanElement
}

export function createPaneDropOverlay(): HTMLDivElement {
  // visual-only drop indicator (its ::after draws the highlighted zone)
  return (<div class="pane-drop" />) as HTMLDivElement
}
