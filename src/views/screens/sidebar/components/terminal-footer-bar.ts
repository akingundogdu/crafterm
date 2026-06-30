import { el } from '@views/lib/dom'
import type { SidebarFootersDeps } from './sidebar-footers.types'

// Terminal-mode footer bar: new terminal / Claude / folder / project + settings.
export function terminalFooterBar(deps: SidebarFootersDeps): HTMLDivElement {
  return el(
    'div',
    { id: 'sidebar-footer' },
    el(
      'button',
      { id: 'new-tab', title: 'New terminal (⌘T)', onClick: deps.onNewTerminal },
      el('span', { class: 'btn-label' }, 'Terminal'),
      el('span', { class: 'kbd' }, '⌘T')
    ),
    el(
      'button',
      { id: 'new-claude', title: 'New Claude terminal (⇧⌘T)', onClick: deps.onNewClaude },
      el('span', { class: 'btn-label' }, 'Claude'),
      el('span', { class: 'kbd' }, '⇧⌘T')
    ),
    el('button', { id: 'new-folder', title: 'New folder (⇧⌘N)', onClick: deps.onNewFolder }, '+ Folder'),
    el('button', { id: 'new-project', title: 'New project', onClick: deps.onNewProject }, '+ Project'),
    el('button', { id: 'settings-btn', title: 'Settings (⌘,)', innerHTML: '&#9881;', onClick: deps.onSettings })
  )
}
