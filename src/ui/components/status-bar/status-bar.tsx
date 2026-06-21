import './status-bar.css'
import { mountStatusBarShell } from './components/status-bar-shell'
import { initStatusbarUsage } from './components/usage-chip'
import { initStatusbarVersion } from './components/version-chip'
import { updateNotifBadge } from './components/notif-badge'
import type { StatusBarDeps } from './status-bar.types'

export { updateNotifBadge }

// Build the status bar's DOM into `#content-statusbar` and wire its chips +
// toggles. Mounted by the main-window bootstrap into the content column.
export function mountStatusBar(contentCol: HTMLElement, deps: StatusBarDeps): void {
  mountStatusBarShell(contentCol, deps)
  initStatusbarUsage()
  initStatusbarVersion()
}
