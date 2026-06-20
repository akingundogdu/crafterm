import './accounts.css'
import { UITexts } from '@texts'
import type { AccountEntry, AccountField } from '@ui/types/types'
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
function metaRow(label: string, value: string, copyable: boolean): HTMLElement {
  return (
    <div class="accounts-meta-row">
      <span class="accounts-meta-key">{label}</span>
      <span class="accounts-meta-val">{value}</span>
      {copyable && (
        <button class="accounts-action small" onClick={makeMetaCopyClick(value)}>
          Copy
        </button>
      )}
    </div>
  ) as HTMLDivElement
}

function fieldRow(a: AccountEntry, f: AccountField): HTMLElement {
  const val = (
    <span class={'accounts-meta-val' + (f.secret ? ' accounts-secret' : '')}>
      {f.secret ? '••••••••' : f.value ?? ''}
    </span>
  ) as HTMLSpanElement
  return (
    <div class="accounts-meta-row">
      <span class="accounts-meta-key">{f.key}</span>
      {val}
      <button class="accounts-action small" onClick={makeFieldCopyClick(a, f)}>
        Copy
      </button>
      {f.secret && (
        <button class="accounts-action small" onClick={makeRevealClick(a, f, val)}>
          Show
        </button>
      )}
    </div>
  ) as HTMLDivElement
}

function accountCard(a: AccountEntry): HTMLElement {
  const hasMeta = !!(a.login || a.url || a.notes)
  const meta = (
    <div class="accounts-metadata">
      {a.login && metaRow('login', a.login, true)}
      {a.url && metaRow('url', a.url, true)}
      {a.notes && metaRow('notes', a.notes, false)}
    </div>
  ) as HTMLDivElement

  const fields = a.fields?.length
    ? ((<div class="accounts-fields">{a.fields.map((f) => fieldRow(a, f))}</div>) as HTMLDivElement)
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
  const bar = (
    <div class="accounts-filters">
      {(['all', 'account', 'secret'] as const).map((k) => (
        <button
          class={'bookmarks-filter' + (k === currentKindFilter() ? ' active' : '')}
          onClick={makeFilterClick(k, renderAccounts)}
        >
          {k === 'all'
            ? UITexts.Accounts.filter.all
            : k === 'account'
              ? UITexts.Accounts.filter.accounts
              : UITexts.Accounts.filter.secrets}
        </button>
      ))}
    </div>
  ) as HTMLDivElement
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
