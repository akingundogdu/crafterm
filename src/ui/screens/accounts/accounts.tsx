import Accounts from '@views/screens/accounts/accounts'
import store from '@views/screens/accounts/accounts.store'
import { makeNewEntryClick, makeSettingsClick } from './accounts.state'

// Accounts sidebar mode — migrated to gea (src/views/screens/accounts). This
// legacy entry mounts the gea component into the sidebar list host and bridges
// the sidebar search (accountsApplyQuery) into the gea store. The static header
// buttons (new entry / new secret / settings) stay wired here.

export function renderAccounts(): void {
  const el = document.getElementById('tab-list')!
  el.replaceChildren()
  el.className = 'tab-list accounts-list-wrap'
  new Accounts().render(el)
}

export function accountsApplyQuery(q: string): void {
  store.setQuery(q)
  renderAccounts()
}

export function initAccounts(): void {
  document.getElementById('accounts-new-entry')?.addEventListener('click', makeNewEntryClick('account'))
  document.getElementById('accounts-new-secret')?.addEventListener('click', makeNewEntryClick('secret'))
  document.getElementById('accounts-settings-btn')?.addEventListener('click', makeSettingsClick())
}
