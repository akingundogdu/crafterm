import { Component } from '@geajs/core'
import { pushMenu, keepOnScreen } from '../context-menu.state'

// The popover container: an empty `.context-menu` div positioned at (x, y). It is
// a gea Component with no handlers, so the freshly rendered root can be lifted out
// of its throwaway host and returned for the orchestrator to fill + mount. Item
// and swatch Components are then rendered INTO this div (their trees rooted here),
// and mountContextMenu moves the whole div into <body> — the proven overlay
// pattern (render into a detached host, then move the host), which keeps gea's
// event wiring intact. Self-contained — no @ui (§2.7).
export default class ContextMenuContainer extends Component {
  template() {
    return <div class="context-menu" />
  }
}

// Renders the container into a throwaway host and returns the positioned
// `.context-menu` div (detached, ready for the orchestrator to fill).
export function createContextMenuContainer(x: number, y: number): HTMLDivElement {
  const host = document.createElement('div')
  new ContextMenuContainer().render(host)
  const menu = host.firstElementChild as HTMLDivElement
  menu.style.left = x + 'px'
  menu.style.top = y + 'px'
  return menu
}

// Moving records it in the open-menu chain at `depth`, appends it to the body,
// and nudges it on screen.
export function mountContextMenu(menu: HTMLDivElement, depth: number, x: number): void {
  document.body.appendChild(menu)
  pushMenu(menu, depth)
  keepOnScreen(menu, depth, x)
}
