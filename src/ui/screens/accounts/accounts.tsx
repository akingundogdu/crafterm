import './accounts.css'
import { UITexts } from '@texts'
import type { AccountEntry } from '@ui/types/types'
import { accountRepo } from '@repositories'
import {
  currentKindFilter,
  setQuery,
  filterEntries,
  makeFilterClick,
  makeEditClick,
  makeDeleteClick,
  makeMetaCopyClick,
  makeFieldCopyClick,
  makeRevealClick,
  makeNewEntryClick,
  makeSettingsClick
} from './accounts.state'
import { metaRow } from './components/meta-row'
import { fieldRow } from './components/field-row'
import { accountFilters } from './components/account-filters'

// One sidebar mode for both 'account' (full credential ledger row) and 'secret'
// (env-var-style single value). Cards share rendering; the kind toggles which
// fields are emphasized in the form.

function tabListEl(): HTMLElement {
  return document.getElementById('tab-list')!
}

// Visible label for a tag chip on the card list.
function tagChip(text: string): HTMLElement {
  return (<span class="accounts-tag">{text}</span>) as HTMLSpanElement
}

// ---- card ---------------------------------------------------------------
function accountCard(a: AccountEntry): HTMLElement {
  const hasMeta = !!(a.login || a.url || a.notes)
  const meta = (
    <div class="accounts-metadata">
      {a.login && metaRow({ label: 'login', value: a.login, copyable: true, onCopy: makeMetaCopyClick(a.login) })}
      {a.url && metaRow({ label: 'url', value: a.url, copyable: true, onCopy: makeMetaCopyClick(a.url) })}
      {a.notes && metaRow({ label: 'notes', value: a.notes, copyable: false, onCopy: () => {} })}
    </div>
  ) as HTMLDivElement

  const fields = a.fields?.length
    ? ((
        <div class="accounts-fields">
          {a.fields.map((f) =>
            fieldRow({
              field: f,
              onCopy: makeFieldCopyClick(a, f),
              onReveal: (valEl) => makeRevealClick(a, f, valEl)
            })
          )}
        </div>
      ) as HTMLDivElement)
    : null

  const tags = a.tags.length
    ? ((<div class="accounts-tags">{a.tags.map((t) => tagChip(t))}</div>) as HTMLDivElement)
    : null

  return (
    <div class={'accounts-card accounts-kind-' + a.kind}>
      <div class="accounts-head">
        <span class={'accounts-badge ' + a.kind}>
          {a.kind === 'secret' ? 'SECRET' : (a.service || 'ACCOUNT').toUpperCase()}
        </span>
        <span class="accounts-label">{a.label}</span>
      </div>
      {hasMeta ? meta : null}
      {fields}
      {tags}
      <div class="accounts-actions">
        <button class="accounts-action" onClick={makeEditClick(a)}>
          Edit
        </button>
        <button class="accounts-action button-danger" onClick={makeDeleteClick(a, renderAccounts)}>
          Delete
        </button>
      </div>
    </div>
  ) as HTMLDivElement
}

// ---- toolbar + list -----------------------------------------------------
export function renderAccounts(): void {
  const el = tabListEl()
  el.replaceChildren()
  el.className = 'tab-list accounts-list-wrap'

  // toolbar (kind filter chips)
  const bar = accountFilters({
    active: currentKindFilter(),
    onSelect: (k) => makeFilterClick(k, renderAccounts)
  })
  el.appendChild(bar)

  const items = filterEntries()
  if (!items.length) {
    el.insertAdjacentHTML(
      'beforeend',
      `<div class="empty-hint">${
        accountRepo.getAll().length === 0 ? UITexts.Accounts.emptyNone : UITexts.Accounts.emptyNoMatches
      }</div>`
    )
    return
  }
  const list = (<div class="accounts-list">{items.map((a) => accountCard(a))}</div>) as HTMLDivElement
  el.appendChild(list)
}

export function accountsApplyQuery(q: string): void {
  setQuery(q)
  renderAccounts()
}

export function initAccounts(): void {
  document.getElementById('accounts-new-entry')?.addEventListener('click', makeNewEntryClick('account'))
  document.getElementById('accounts-new-secret')?.addEventListener('click', makeNewEntryClick('secret'))
  document.getElementById('accounts-settings-btn')?.addEventListener('click', makeSettingsClick())
}
