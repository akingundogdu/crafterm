import { el } from '@views/lib/dom'
import type { SidebarFootersDeps } from './sidebar-footers.types'

// Docker-mode footer bar: refresh docker view + settings.
export function dockerFooterBar(deps: SidebarFootersDeps): HTMLDivElement {
  return el(
    'div',
    { id: 'docker-footer' },
    el(
      'button',
      { id: 'docker-refresh', title: 'Refresh docker view', onClick: deps.onDockerRefresh },
      el('span', { class: 'btn-label' }, '⟳ Refresh')
    ),
    el('button', { id: 'docker-settings-btn', title: 'Settings (⌘,)', innerHTML: '&#9881;', onClick: deps.onSettings })
  )
}
