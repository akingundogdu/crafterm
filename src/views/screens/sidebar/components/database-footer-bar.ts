import { el } from '@views/lib/dom'
import type { SidebarFootersDeps } from './sidebar-footers.types'

// Database-mode footer bar: new database project + settings.
export function databaseFooterBar(deps: SidebarFootersDeps): HTMLDivElement {
  return el(
    'div',
    { id: 'database-footer' },
    el(
      'button',
      { id: 'db-new-project', title: 'New database project', onClick: deps.onDatabaseNewProject },
      el('span', { class: 'btn-label' }, '+ Project')
    ),
    el('button', { id: 'db-settings-btn', title: 'Settings (⌘,)', innerHTML: '&#9881;', onClick: deps.onSettings })
  )
}
