import { makeNewEntryClick, makeSettingsClick } from './accounts.state'

// Accounts sidebar mode — migrated to gea (src/views/screens/accounts). The
// renderAccounts/accountsApplyQuery entry wrappers now live in the gea entry and
// are re-exported here so existing @ui consumers keep their imports. The static
// header buttons (new entry / new secret / settings) stay wired here via
// initAccounts.
export { renderAccounts, accountsApplyQuery } from '@views/screens/accounts/accounts'

export function initAccounts(): void {
  document.getElementById('accounts-new-entry')?.addEventListener('click', makeNewEntryClick('account'))
  document.getElementById('accounts-new-secret')?.addEventListener('click', makeNewEntryClick('secret'))
  document.getElementById('accounts-settings-btn')?.addEventListener('click', makeSettingsClick())
}
