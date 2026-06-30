import { el } from '@views/lib/dom'

// Accounts-mode footer bar: new account / new secret + settings. The buttons are
// wired separately by the accounts module (`initAccounts`) once this markup exists,
// so this bar takes no dependency handlers.
export function accountsFooterBar(): HTMLDivElement {
  return el(
    'div',
    { id: 'accounts-footer' },
    el('button', { id: 'accounts-new-entry', title: 'New account' }, el('span', { class: 'btn-label' }, '+ Account')),
    el(
      'button',
      { id: 'accounts-new-secret', title: 'New secret (env var)' },
      el('span', { class: 'btn-label' }, '+ Secret')
    ),
    el('button', { id: 'accounts-settings-btn', title: 'Settings (⌘,)', innerHTML: '&#9881;' })
  )
}
