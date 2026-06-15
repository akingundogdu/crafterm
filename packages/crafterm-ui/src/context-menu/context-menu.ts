// Shared sidebar context menu — one implementation used by the terminal sidebar,
// the notebook, and the database tree, so every right-click menu looks and
// behaves identically (only the items + color target differ). Supports nested
// (cascading) submenus via `children`, including async-populated ones.

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

export interface ContextMenuItem {
  label: string
  run?: () => void
  danger?: boolean
  // When set, clicking the item runs `run` but keeps the menu open and re-opens
  // the submenu it lives in (e.g. a "Refresh" item that clears a cache and lets
  // its parent producer re-fetch).
  keepOpen?: boolean
  // A submenu: either ready items or a (possibly async) producer evaluated when
  // the submenu opens (e.g. enumerating simulators/devices on demand).
  children?: ContextMenuItem[] | (() => ContextMenuItem[] | Promise<ContextMenuItem[]>)
}

export interface ColorOption {
  current: string | null
  onPick: (color: string | null) => void
}

// The open menu chain, indexed by depth (0 = root). Submenus live deeper.
let menuStack: HTMLElement[] = []
let outsideHandler: ((e: MouseEvent) => void) | null = null

function closeFromDepth(depth: number): void {
  while (menuStack.length > depth) menuStack.pop()?.remove()
}

export function closeContextMenu(): void {
  closeFromDepth(0)
  if (outsideHandler) {
    document.removeEventListener('mousedown', outsideHandler, true)
    outsideHandler = null
  }
}

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
  const menu = document.createElement('div')
  menu.className = 'context-menu'
  menu.style.left = x + 'px'
  menu.style.top = y + 'px'

  for (const item of items) {
    const b = document.createElement('button')
    const hasChildren = !!item.children
    b.textContent = hasChildren ? `${item.label}  ▸` : item.label
    if (item.danger) b.classList.add('danger')
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
        const placeholder = menuStack[depth + 1]
        const kids = await src()
        // Bail if the menu was torn down or the user opened a different submenu.
        if (!menu.isConnected || menuStack[depth + 1] !== placeholder) return
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
      b.addEventListener('click', () => {
        if (item.keepOpen) {
          item.run?.()
          reopen?.()
          return
        }
        closeContextMenu()
        item.run?.()
      })
    }
    menu.appendChild(b)
  }

  if (depth === 0 && color) {
    const colors = document.createElement('div')
    colors.className = 'color-swatches'
    const none = document.createElement('button')
    none.className = 'swatch none' + (color.current === null ? ' active' : '')
    none.title = 'No color'
    none.addEventListener('click', () => {
      closeContextMenu()
      color.onPick(null)
    })
    colors.appendChild(none)
    for (const c of NODE_PALETTE) {
      const s = document.createElement('button')
      s.className = 'swatch' + (color.current === c ? ' active' : '')
      s.style.background = c
      s.addEventListener('click', () => {
        closeContextMenu()
        color.onPick(c)
      })
      colors.appendChild(s)
    }
    menu.appendChild(colors)
  }

  document.body.appendChild(menu)
  menuStack[depth] = menu
  menuStack.length = depth + 1

  // Keep on screen: flip a submenu to the left of its parent when it overflows.
  const r = menu.getBoundingClientRect()
  if (r.right > window.innerWidth) {
    const left = depth > 0 ? x - r.width - menuStack[depth - 1].getBoundingClientRect().width + 4 : window.innerWidth - r.width - 8
    menu.style.left = Math.max(8, left) + 'px'
  }
  if (r.bottom > window.innerHeight) menu.style.top = Math.max(8, window.innerHeight - r.height - 8) + 'px'
}

export function showContextMenu(e: MouseEvent, items: ContextMenuItem[], color?: ColorOption): void {
  e.preventDefault()
  e.stopPropagation()
  closeContextMenu()
  renderMenu(items, 0, e.clientX, e.clientY, color)

  outsideHandler = (ev: MouseEvent): void => {
    if (!menuStack.some((m) => m.contains(ev.target as Node))) closeContextMenu()
  }
  setTimeout(() => document.addEventListener('mousedown', outsideHandler!, true))
}
