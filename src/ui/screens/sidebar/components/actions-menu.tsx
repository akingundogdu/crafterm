import { actionMenuRepo } from '@repositories'
import { BUILTIN_ACTION_RUN, runActionItem } from '../sidebar.state'

// Flattened sidebar ⋯ action-menu entries for the global search (Cmd+J). Skips
// hidden rows and builtins whose id is no longer registered, mirroring the menu.
export function actionMenuSearchEntries(): { label: string; run: () => void }[] {
  const out: { label: string; run: () => void }[] = []
  for (const item of actionMenuRepo.getAll()) {
    if (item.hidden) continue
    if (item.kind === 'builtin' && !BUILTIN_ACTION_RUN[item.builtinId ?? '']) continue
    out.push({ label: item.title, run: () => runActionItem(item) })
  }
  return out
}

function showActionsMenu(anchor: HTMLElement): void {
  document.querySelector('.context-menu')?.remove()
  const menu = document.createElement('div')
  menu.className = 'context-menu'
  const r = anchor.getBoundingClientRect()
  menu.style.left = Math.min(r.left, window.innerWidth - 200) + 'px'
  menu.style.top = r.bottom + 4 + 'px'
  const addItem = (label: string, fn: () => void): void => {
    const b = document.createElement('button')
    b.textContent = label
    b.addEventListener('click', () => {
      menu.remove()
      fn()
    })
    menu.appendChild(b)
  }
  for (const item of actionMenuRepo.getAll()) {
    if (item.hidden) continue
    // Skip builtins whose id is no longer known (e.g. after a downgrade).
    if (item.kind === 'builtin' && !BUILTIN_ACTION_RUN[item.builtinId ?? '']) continue
    addItem(item.title, () => runActionItem(item))
  }
  document.body.appendChild(menu)
  const onDown = (ev: MouseEvent): void => {
    if (!menu.contains(ev.target as Node)) {
      menu.remove()
      document.removeEventListener('mousedown', onDown, true)
    }
  }
  setTimeout(() => document.addEventListener('mousedown', onDown, true))
}

// Wire the sidebar ⋯ actions button to open its menu.
export function wireActionsMenu(): void {
  const sidebarActionsEl = document.getElementById('sidebar-actions')!
  sidebarActionsEl.addEventListener('click', (e) => {
    e.stopPropagation()
    showActionsMenu(sidebarActionsEl)
  })
}
