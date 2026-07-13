import { Component } from '@geajs/core'

// Visual-only drag decorations for a pane: the ⠿ grip handle inserted into the
// header and the highlighted drop overlay appended to the pane box. Pure view —
// the actual mousedown wiring lives in setupPaneDnd (pane-drag.engine).
class PaneGrip extends Component {
  template() {
    return (
      <span class="pane-grip" title="Drag to move this pane">
        ⠿
      </span>
    )
  }
}

class PaneDropOverlay extends Component {
  // visual-only drop indicator (its ::after draws the highlighted zone)
  template() {
    return <div class="pane-drop" />
  }
}

export function createPaneGrip(): HTMLSpanElement {
  const host = document.createElement('div')
  new PaneGrip().render(host)
  return host.firstElementChild as HTMLSpanElement
}

export function createPaneDropOverlay(): HTMLDivElement {
  const host = document.createElement('div')
  new PaneDropOverlay().render(host)
  return host.firstElementChild as HTMLDivElement
}
