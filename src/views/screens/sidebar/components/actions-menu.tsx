import { Component } from '@geajs/core'
import { actionMenuRepo } from '@repositories'
import type { ActionMenuItem } from '@views/types/types'
import { BUILTIN_ACTION_RUN, runActionItem } from '../sidebar.store'

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

// The floating sidebar ⋯ actions menu. Static per open — no store — so a one-shot
// gea render is enough. The visible items + close callback arrive via the
// constructor into plain fields (a gea Component only populates `this.props` when
// rendered from a parent template, not from a manual `new X()`). Self-contained —
// no @ui (§2.7).
class ActionsMenu extends Component {
  private readonly items: ActionMenuItem[]
  private readonly onCloseFn: () => void

  constructor(opts: { items: ActionMenuItem[]; onClose: () => void }) {
    super()
    this.items = opts.items
    this.onCloseFn = opts.onClose
  }

  private run = (item: ActionMenuItem): void => {
    this.onCloseFn()
    runActionItem(item)
  }

  template() {
    return (
      <div class="context-menu">
        {this.items.map((item) => (
          <button key={item.id} onClick={() => this.run(item)}>
            {item.title}
          </button>
        ))}
      </div>
    )
  }
}

// Opens the actions menu anchored under the ⋯ button. The gea ActionsMenu is
// rendered into <body> (NOT moved out of its gea render tree — that would break
// gea's event wiring), then positioned from the anchor rect and closed on an
// outside mousedown.
function showActionsMenu(anchor: HTMLElement): void {
  document.querySelector('.context-menu')?.remove()
  const r = anchor.getBoundingClientRect()
  const visibleItems = actionMenuRepo.getAll().filter((item) => {
    if (item.hidden) return false
    // Skip builtins whose id is no longer known (e.g. after a downgrade).
    if (item.kind === 'builtin' && !BUILTIN_ACTION_RUN[item.builtinId ?? '']) return false
    return true
  })
  new ActionsMenu({ items: visibleItems, onClose: () => close() }).render(document.body)
  const menu = document.querySelector('.context-menu') as HTMLElement | null
  if (!menu) return
  menu.style.left = Math.min(r.left, window.innerWidth - 200) + 'px'
  menu.style.top = r.bottom + 4 + 'px'
  const onDown = (ev: MouseEvent): void => {
    if (!menu.contains(ev.target as Node)) close()
  }
  const close = (): void => {
    menu.remove()
    document.removeEventListener('mousedown', onDown, true)
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
