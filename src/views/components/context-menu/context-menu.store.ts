import type { ContextMenuItem } from './context-menu.types'

export const NODE_PALETTE = [
  '#f85149',
  '#db6d28',
  '#d29922',
  '#3fb950',
  '#2f81f7',
  '#a371f7',
  '#db61a2',
  '#8b949e'
]

// The open menu chain, indexed by depth (0 = root). Submenus live deeper.
let menuStack: HTMLElement[] = []
let outsideHandler: ((e: MouseEvent) => void) | null = null

export function closeFromDepth(depth: number): void {
  while (menuStack.length > depth) menuStack.pop()?.remove()
}

export function closeContextMenu(): void {
  closeFromDepth(0)
  if (outsideHandler) {
    document.removeEventListener('mousedown', outsideHandler, true)
    outsideHandler = null
  }
}

// Records a freshly rendered menu at its depth and trims any deeper entries.
export function pushMenu(menu: HTMLElement, depth: number): void {
  menuStack[depth] = menu
  menuStack.length = depth + 1
}

export function menuAt(depth: number): HTMLElement | undefined {
  return menuStack[depth]
}

// Keep on screen: flip a submenu to the left of its parent when it overflows.
export function keepOnScreen(menu: HTMLElement, depth: number, x: number): void {
  const r = menu.getBoundingClientRect()
  if (r.right > window.innerWidth) {
    const parentWidth = menuStack[depth - 1]?.getBoundingClientRect().width ?? 0
    const left = depth > 0 ? x - r.width - parentWidth + 4 : window.innerWidth - r.width - 8
    menu.style.left = Math.max(8, left) + 'px'
  }
  if (r.bottom > window.innerHeight) menu.style.top = Math.max(8, window.innerHeight - r.height - 8) + 'px'
}

// Click handler for a leaf item: `keepOpen` runs the action and re-opens its
// submenu; otherwise it closes the whole menu before running.
export function makeLeafClick(item: ContextMenuItem, reopen?: () => void): () => void {
  return () => {
    if (item.keepOpen) {
      item.run?.()
      reopen?.()
      return
    }
    closeContextMenu()
    item.run?.()
  }
}

// Click handler for a color swatch: closes the menu, then applies the pick.
export function makeSwatchClick(onPick: (color: string | null) => void, color: string | null): () => void {
  return () => {
    closeContextMenu()
    onPick(color)
  }
}

// Installs the outside-click dismissal (deferred a tick so the opening click
// doesn't immediately close the menu).
export function installOutsideHandler(): void {
  outsideHandler = (ev: MouseEvent): void => {
    if (!menuStack.some((m) => m.contains(ev.target as Node))) closeContextMenu()
  }
  setTimeout(() => document.addEventListener('mousedown', outsideHandler!, true))
}
