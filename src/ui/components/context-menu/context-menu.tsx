import './context-menu.css'
import type { ContextMenuItem, ColorOption } from './context-menu.types'
import { closeFromDepth, closeContextMenu, installOutsideHandler } from './context-menu.state'
import { createContextMenuContainer, mountContextMenu } from './components/context-menu-container'
import { createContextMenuItem } from './components/context-menu-item'
import { createColorSwatches } from './components/context-menu-color-swatches'

export type { ContextMenuItem, ColorOption } from './context-menu.types'
export { NODE_PALETTE, closeContextMenu } from './context-menu.state'

// Shared sidebar context menu — one implementation used by the terminal sidebar,
// the notebook, and the database tree, so every right-click menu looks and
// behaves identically (only the items + color target differ). Supports nested
// (cascading) submenus via `children`, including async-populated ones.

// Render one menu level. Submenu parents open a flyout to the right on hover;
// hovering a leaf collapses any deeper level so only one branch is open at once.
function renderMenu(
  items: ContextMenuItem[],
  depth: number,
  x: number,
  y: number,
  color?: ColorOption,
  reopen?: () => void
): void {
  closeFromDepth(depth)
  const menu = createContextMenuContainer(x, y)

  for (const item of items) {
    menu.appendChild(createContextMenuItem(item, menu, depth, renderMenu, reopen))
  }

  if (depth === 0 && color) menu.appendChild(createColorSwatches(color))

  mountContextMenu(menu, depth, x)
}

export function showContextMenu(e: MouseEvent, items: ContextMenuItem[], color?: ColorOption): void {
  e.preventDefault()
  e.stopPropagation()
  closeContextMenu()
  renderMenu(items, 0, e.clientX, e.clientY, color)
  installOutsideHandler()
}
