import type { ContextMenuItem, ColorOption } from '../context-menu.types'
import { closeFromDepth, menuAt } from '../context-menu.state'

// The recursive renderer injected from the orchestrator so the flyout chain
// keeps working: a submenu renders another menu level, which can open further
// submenus through the same callback.
export type RenderMenu = (
  items: ContextMenuItem[],
  depth: number,
  x: number,
  y: number,
  color?: ColorOption,
  reopen?: () => void
) => void

// Builds the open() handler for a submenu parent: opens a flyout to the right of
// the parent button. For async producers it shows an immediate "Loading…"
// flyout, then swaps in the results once they resolve.
export function makeSubmenuOpen(
  item: ContextMenuItem,
  menu: HTMLDivElement,
  button: HTMLButtonElement,
  depth: number,
  renderMenu: RenderMenu
): () => Promise<void> {
  const open = async (): Promise<void> => {
    closeFromDepth(depth + 1)
    const r = button.getBoundingClientRect()
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
  return open
}
