import { Component } from '@geajs/core'

// Accounts-mode footer bar: new account / new secret + settings. The buttons are
// wired separately by the accounts module (`initAccounts`) once this markup exists,
// so this bar takes no dependency handlers. Static per render — the sidebar rebuilds
// the footers wholesale on refresh — so no store subscription is needed.
export default class AccountsFooterBar extends Component {
  template() {
    return (
      <div id="accounts-footer">
        <button id="accounts-new-entry" title="New account">
          <span class="btn-label">+ Account</span>
        </button>
        <button id="accounts-new-secret" title="New secret (env var)">
          <span class="btn-label">+ Secret</span>
        </button>
        <button id="accounts-settings-btn" title="Settings (⌘,)">⚙</button>
      </div>
    )
  }
}

// Builds the accounts footer element for the sidebar to insert. Signature preserved
// so the sidebar-footers consumer resolves unchanged.
export function accountsFooterBar(): HTMLDivElement {
  const host = document.createElement('div')
  new AccountsFooterBar().render(host)
  return host.firstElementChild as HTMLDivElement
}
