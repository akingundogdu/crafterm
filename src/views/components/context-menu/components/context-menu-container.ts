import { el } from '@views/lib/dom'
import { pushMenu, keepOnScreen } from '../context-menu.state'

// Creates the popover container DOM at (x, y). Mounting records it in the
// open-menu chain at `depth`, appends it to the body, and nudges it on screen.
export function createContextMenuContainer(x: number, y: number): HTMLDivElement {
  const menu = el('div', { class: 'context-menu' })
  menu.style.left = x + 'px'
  menu.style.top = y + 'px'
  return menu
}

export function mountContextMenu(menu: HTMLDivElement, depth: number, x: number): void {
  document.body.appendChild(menu)
  pushMenu(menu, depth)
  keepOnScreen(menu, depth, x)
}
