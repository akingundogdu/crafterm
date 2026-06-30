import { el } from '@views/lib/dom'
import type { StatusBarDeps } from '../status-bar.types'

// Static status-bar chrome (toggles, version chip, usage chip, refresh, notif
// toggle + badge). An imperative widget built with the @views el() helper (plain
// DOM; gea reactivity buys nothing for static chrome). Chip behavior is wired
// separately by the orchestrator.

// SVG namespace icons applied via innerHTML.
const SIDEBAR_TOGGLE_SVG =
  '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
  '<rect x="1.6" y="2.6" width="12.8" height="10.8" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.4" />' +
  '<line x1="6" y1="2.6" x2="6" y2="13.4" stroke="currentColor" stroke-width="1.4" /></svg>'
const NOTIF_TOGGLE_SVG =
  '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
  '<rect x="1.6" y="2.6" width="12.8" height="10.8" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.4" />' +
  '<line x1="10" y1="2.6" x2="10" y2="13.4" stroke="currentColor" stroke-width="1.4" /></svg>'
const USAGE_REFRESH_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">' +
  '<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />' +
  '<path d="M13.7 2.2v3.2h-3.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>'

// Build the status bar's static DOM into `#content-statusbar` and prepend it to
// the content column. Chip behavior is wired separately by the orchestrator.
export function mountStatusBarShell(contentCol: HTMLElement, deps: StatusBarDeps): void {
  const notifBadge = el('span', { id: 'notif-badge' })
  const bar = el(
    'div',
    { id: 'content-statusbar' },
    el('button', {
      id: 'statusbar-sidebar-toggle',
      title: 'Toggle sidebar (⌘B)',
      'aria-label': 'Toggle sidebar',
      innerHTML: SIDEBAR_TOGGLE_SVG,
      onClick: deps.onToggleSidebar
    }),
    el('div', { id: 'content-statusbar-drag' }),
    el(
      'button',
      { id: 'statusbar-version', title: 'App version', 'aria-label': 'App version' },
      el('span', { class: 'version-dot' }),
      el('span', { class: 'version-text' }, 'v—')
    ),
    el(
      'button',
      { id: 'statusbar-claude-usage', title: 'Claude usage', 'aria-label': 'Claude usage' },
      el('span', { class: 'usage-icon' }, '⌬'),
      el('span', { class: 'usage-text' }, '—')
    ),
    el('button', {
      id: 'statusbar-usage-refresh',
      title: 'Refresh usage',
      'aria-label': 'Refresh usage',
      innerHTML: USAGE_REFRESH_SVG
    }),
    el('button', {
      id: 'statusbar-notif-toggle',
      title: 'Toggle notifications (⌥⌘→)',
      'aria-label': 'Toggle notifications',
      onClick: deps.onToggleNotif,
      innerHTML: NOTIF_TOGGLE_SVG
    })
  )
  // innerHTML on the notif toggle would clobber the badge, so append it after.
  bar.querySelector('#statusbar-notif-toggle')!.appendChild(notifBadge)
  contentCol.prepend(bar)
}
