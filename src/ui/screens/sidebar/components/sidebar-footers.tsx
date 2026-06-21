import type { SidebarFootersDeps } from './sidebar-footers.types'
import { terminalFooterBar } from './terminal-footer-bar'
import { notebookFooterBar } from './notebook-footer-bar'
import { databaseFooterBar } from './database-footer-bar'
import { dockerFooterBar } from './docker-footer-bar'
import { accountsFooterBar } from './accounts-footer-bar'

// The five per-mode sidebar footer button bars (terminal / notebook / database /
// docker / accounts). Built into `#sidebar` after the tab list. Exactly one shows
// at a time — `display` is owned by the `#app.mode-*` rules in sidebar.css, so the
// markup keeps the original ids and default display state untouched.
//
// Action handlers are injected by the main-window bootstrap so this component does
// not import the command/view modules directly (avoids import cycles). The
// accounts footer's buttons are wired separately by the accounts module
// (`initAccounts`) once this markup exists.
export function mountSidebarFooters(host: HTMLElement, deps: SidebarFootersDeps): void {
  host.append(
    terminalFooterBar(deps),
    notebookFooterBar(deps),
    databaseFooterBar(deps),
    dockerFooterBar(deps),
    accountsFooterBar()
  )
}
