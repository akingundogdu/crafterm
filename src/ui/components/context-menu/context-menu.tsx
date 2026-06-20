import { UITexts } from '@texts'
import './context-menu.css'
import type { ContextMenuItem, ColorOption } from './context-menu.types'
import {
  NODE_PALETTE,
  closeFromDepth,
  closeContextMenu,
  pushMenu,
  menuAt,
  keepOnScreen,
  makeLeafClick,
  makeSwatchClick,
  installOutsideHandler
} from './context-menu.state'

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
  const menu = (<div class="context-menu" style={{ left: x + 'px', top: y + 'px' }} />) as HTMLDivElement

  for (const item of items) {
    const hasChildren = !!item.children
    const b = (
      <button class={item.danger ? 'context-menu-danger' : undefined}>
        {hasChildren ? `${item.label}  ▸` : item.label}
      </button>
    ) as HTMLButtonElement
    if (hasChildren) {
      const open = async (): Promise<void> => {
        closeFromDepth(depth + 1)
        const r = b.getBoundingClientRect()
        const src = item.children!
        if (typeof src !== 'function') {
          renderMenu(src.length ? src : [{ label: '(none)' }], depth + 1, r.right - 2, r.top - 4, undefined, open)
          return
        }
        // Async producer (e.g. enumerating devices/schemes) — show an immediate
        // "Loading…" flyout so the menu never feels frozen, then swap in results.
        renderMenu([{ label: 'Loading…' }], depth + 1, r.right - 2, r.top - 4)
        const placeholder = menuAt(depth + 1)
        const kids = await src()
        // Bail if the menu was torn down or the user opened a different submenu.
        if (!menu.isConnected || menuAt(depth + 1) !== placeholder) return
        renderMenu(kids.length ? kids : [{ label: '(none)' }], depth + 1, r.right - 2, r.top - 4, undefined, open)
      }
      b.addEventListener('mouseenter', () => void open())
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        void open()
      })
    } else {
      // A leaf doesn't close the open submenu on hover — that would shut the
      // flyout the user is diagonally reaching for. It closes when another parent
      // opens, a leaf is clicked, or the user clicks outside.
      b.addEventListener('click', makeLeafClick(item, reopen))
    }
    menu.appendChild(b)
  }

  if (depth === 0 && color) {
    const none = (
      <button
        class={
          'context-menu-swatch context-menu-swatch-none' +
          (color.current === null ? ' context-menu-swatch-active' : '')
        }
        title={UITexts.Components.noColor}
      />
    ) as HTMLButtonElement
    none.addEventListener('click', makeSwatchClick(color.onPick, null))
    const colors = (
      <div class="context-menu-swatches">
        {none}
        {NODE_PALETTE.map((c) => {
          const s = (
            <button
              class={'context-menu-swatch' + (color.current === c ? ' context-menu-swatch-active' : '')}
              style={{ background: c }}
            />
          ) as HTMLButtonElement
          s.addEventListener('click', makeSwatchClick(color.onPick, c))
          return s
        })}
      </div>
    ) as HTMLDivElement
    menu.appendChild(colors)
  }

  document.body.appendChild(menu)
  pushMenu(menu, depth)
  keepOnScreen(menu, depth, x)
}

export function showContextMenu(e: MouseEvent, items: ContextMenuItem[], color?: ColorOption): void {
  e.preventDefault()
  e.stopPropagation()
  closeContextMenu()
  renderMenu(items, 0, e.clientX, e.clientY, color)
  installOutsideHandler()
}
