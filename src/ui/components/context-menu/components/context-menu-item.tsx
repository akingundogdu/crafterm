import type { ContextMenuItem } from '../context-menu.types'
import { makeLeafClick } from '../context-menu.state'
import { makeSubmenuOpen, type RenderMenu } from './context-menu-submenu'

// Builds one item button. A parent (has `children`) opens a flyout to the right
// on hover/click; a leaf runs its action via makeLeafClick (with reopen so a
// keepOpen item can re-open its submenu).
export function createContextMenuItem(
  item: ContextMenuItem,
  menu: HTMLDivElement,
  depth: number,
  renderMenu: RenderMenu,
  reopen?: () => void
): HTMLButtonElement {
  const hasChildren = !!item.children
  // A leaf doesn't close the open submenu on hover — that would shut the flyout
  // the user is diagonally reaching for. It closes when another parent opens, a
  // leaf is clicked, or the user clicks outside.
  let open: (() => void) | null = null
  const b = (
    <button
      class={item.danger ? 'context-menu-danger' : undefined}
      onMouseEnter={hasChildren ? () => void open?.() : undefined}
      onClick={
        hasChildren
          ? (e: MouseEvent) => {
              e.stopPropagation()
              void open?.()
            }
          : makeLeafClick(item, reopen)
      }
    >
      {hasChildren ? `${item.label}  ▸` : item.label}
    </button>
  ) as HTMLButtonElement
  if (hasChildren) {
    open = makeSubmenuOpen(item, menu, b, depth, renderMenu)
  }
  return b
}
