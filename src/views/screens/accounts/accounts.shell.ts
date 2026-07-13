import store from './accounts.store'
import { openAccountForm } from './components/account-form.open'

// Static-header wiring for the Accounts sidebar mode: the new-account / new-secret
// / settings buttons (built by the sidebar footer bar) open the gea account form
// or route to Settings. Consumed by the shell (main.state) at init. Self-contained
// — no @ui (§2.7).

export function makeNewEntryClick(kind: 'account' | 'secret'): () => void {
  return () => openAccountForm(undefined, kind, () => store.reload())
}

export function makeSettingsClick(): () => void {
  // Routed via the existing settings button to avoid an import cycle with main.ts.
  return () => {
    document.getElementById('settings-btn')?.dispatchEvent(new MouseEvent('click'))
  }
}

export function initAccounts(): void {
  document.getElementById('accounts-new-entry')?.addEventListener('click', makeNewEntryClick('account'))
  document.getElementById('accounts-new-secret')?.addEventListener('click', makeNewEntryClick('secret'))
  document.getElementById('accounts-settings-btn')?.addEventListener('click', makeSettingsClick())
}
