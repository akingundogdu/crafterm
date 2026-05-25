// Shared sidebar context menu — one implementation used by the terminal sidebar,
// the notebook, and the database tree, so every right-click menu looks and
// behaves identically (only the items + color target differ).

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
  run: () => void
  danger?: boolean
}

export interface ColorOption {
  current: string | null
  onPick: (color: string | null) => void
}

let cleanup: (() => void) | null = null

export function closeContextMenu(): void {
  document.querySelector('.context-menu')?.remove()
  if (cleanup) {
    cleanup()
    cleanup = null
  }
}

export function showContextMenu(e: MouseEvent, items: ContextMenuItem[], color?: ColorOption): void {
  e.preventDefault()
  e.stopPropagation()
  closeContextMenu()
  const menu = document.createElement('div')
  menu.className = 'context-menu'
  menu.style.left = e.clientX + 'px'
  menu.style.top = e.clientY + 'px'

  for (const item of items) {
    const b = document.createElement('button')
    b.textContent = item.label
    if (item.danger) b.classList.add('danger')
    b.addEventListener('click', () => {
      closeContextMenu()
      item.run()
    })
    menu.appendChild(b)
  }

  if (color) {
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
  // keep the menu on screen
  const r = menu.getBoundingClientRect()
  if (r.bottom > window.innerHeight) menu.style.top = window.innerHeight - r.height - 8 + 'px'
  if (r.right > window.innerWidth) menu.style.left = window.innerWidth - r.width - 8 + 'px'

  const onDown = (ev: MouseEvent): void => {
    if (!menu.contains(ev.target as Node)) closeContextMenu()
  }
  setTimeout(() => document.addEventListener('mousedown', onDown, true))
  cleanup = () => document.removeEventListener('mousedown', onDown, true)
}
