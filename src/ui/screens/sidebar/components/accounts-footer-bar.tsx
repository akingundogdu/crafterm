// Accounts-mode footer bar: new account / new secret + settings. The buttons are
// wired separately by the accounts module (`initAccounts`) once this markup exists,
// so this bar takes no dependency handlers.
export function accountsFooterBar(): HTMLDivElement {
  return (
    <div id="accounts-footer">
      <button id="accounts-new-entry" title="New account">
        <span class="btn-label">+ Account</span>
      </button>
      <button id="accounts-new-secret" title="New secret (env var)">
        <span class="btn-label">+ Secret</span>
      </button>
      <button id="accounts-settings-btn" title="Settings (⌘,)" innerHTML="&#9881;" />
    </div>
  ) as HTMLDivElement
}
