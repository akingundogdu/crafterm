import './accounts.css'
import type { AccountEntry, AccountField } from '../../types'
import { accountRepo } from '@services/storage/repositories'
import { promptConfirm } from '../../dialog'
import { secretsService } from '@services'
import { showAccountForm } from './components/account-form'

// One sidebar mode for both 'account' (full credential ledger row) and 'secret'
// (env-var-style single value). Cards share rendering; the kind toggles which
// fields are emphasized in the form.

let query = ''
let kindFilter: 'all' | 'account' | 'secret' = 'all'

function tabListEl(): HTMLElement {
  return document.getElementById('tab-list')!
}

// Visible label for a tag chip on the card list.
function tagChip(text: string): HTMLElement {
  return (<span class="accounts-tag">{text}</span>) as HTMLSpanElement
}

function filterEntries(): AccountEntry[] {
  const q = query.trim().toLowerCase()
  return accountRepo
    .getAll()
    .filter((a) => kindFilter === 'all' || a.kind === kindFilter)
    .filter((a) => {
      if (!q) return true
      const hay = [a.label, a.service, a.login, a.url, a.notes, a.tags.join(' '), ...(a.fields ?? []).map((f) => f.key)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

async function copyToClipboard(text: string, btn: HTMLButtonElement): Promise<void> {
  await navigator.clipboard.writeText(text)
  const prev = btn.textContent
  btn.textContent = 'Copied'
  setTimeout(() => (btn.textContent = prev), 1100)
}

// ---- card ---------------------------------------------------------------
function accountCard(a: AccountEntry): HTMLElement {
  const head = (
    <div class="accounts-head">
      <span class={'accounts-badge ' + a.kind}>
        {a.kind === 'secret' ? 'SECRET' : (a.service || 'ACCOUNT').toUpperCase()}
      </span>
      <span class="accounts-label">{a.label}</span>
    </div>
  ) as HTMLDivElement

  const meta = (<div class="accounts-meta" />) as HTMLDivElement
  if (a.login) meta.append(metaRow('login', a.login, true))
  if (a.url) meta.append(metaRow('url', a.url, true))
  if (a.notes) meta.append(metaRow('notes', a.notes, false))

  let fields: HTMLElement | null = null
  if (a.fields?.length) {
    fields = (<div class="accounts-fields" />) as HTMLDivElement
    a.fields.forEach((f) => fields!.appendChild(fieldRow(a, f)))
  }

  let tags: HTMLElement | null = null
  if (a.tags.length) {
    tags = (<div class="accounts-tags" />) as HTMLDivElement
    a.tags.forEach((t) => tags!.appendChild(tagChip(t)))
  }

  const edit = (<button class="accounts-act">Edit</button>) as HTMLButtonElement
  edit.addEventListener('click', () => showAccountForm(a))
  const del = (<button class="accounts-act button-danger">Delete</button>) as HTMLButtonElement
  del.addEventListener('click', async () => {
    const ok = await promptConfirm({
      title: 'Delete entry',
      message: a.label,
      confirmText: 'Delete'
    })
    if (!ok) return
    accountRepo.remove(a.id)
    await secretsService.delete(a.id)
    renderAccounts()
  })

  const el = (
    <div class={'accounts-card accounts-kind-' + a.kind}>
      {head}
      {meta.childElementCount ? meta : null}
      {fields}
      {tags}
      <div class="accounts-actions">
        {edit}
        {del}
      </div>
    </div>
  ) as HTMLDivElement
  return el
}

function metaRow(label: string, value: string, copyable: boolean): HTMLElement {
  const row = (
    <div class="accounts-meta-row">
      <span class="accounts-meta-key">{label}</span>
      <span class="accounts-meta-val">{value}</span>
    </div>
  ) as HTMLDivElement
  if (copyable) {
    const copy = (<button class="accounts-act small">Copy</button>) as HTMLButtonElement
    copy.addEventListener('click', () => void copyToClipboard(value, copy))
    row.append(copy)
  }
  return row
}

function fieldRow(a: AccountEntry, f: AccountField): HTMLElement {
  const val = (
    <span class={'accounts-meta-val' + (f.secret ? ' accounts-secret' : '')}>
      {f.secret ? '••••••••' : f.value ?? ''}
    </span>
  ) as HTMLSpanElement
  const row = (
    <div class="accounts-meta-row">
      <span class="accounts-meta-key">{f.key}</span>
      {val}
    </div>
  ) as HTMLDivElement
  const copy = (<button class="accounts-act small">Copy</button>) as HTMLButtonElement
  copy.addEventListener('click', async () => {
    let v = f.value ?? ''
    if (f.secret) {
      const stored = await secretsService.get(a.id, f.key)
      if (stored == null) {
        copy.textContent = 'Unavailable'
        setTimeout(() => (copy.textContent = 'Copy'), 1100)
        return
      }
      v = stored
    }
    void copyToClipboard(v, copy)
  })
  row.append(copy)
  if (f.secret) {
    const reveal = (<button class="accounts-act small">Show</button>) as HTMLButtonElement
    reveal.addEventListener('click', async () => {
      if (val.classList.contains('shown')) {
        val.textContent = '••••••••'
        val.classList.remove('shown')
        reveal.textContent = 'Show'
        return
      }
      const stored = await secretsService.get(a.id, f.key)
      val.textContent = stored ?? '(not stored yet)'
      val.classList.add('shown')
      reveal.textContent = 'Hide'
    })
    row.append(reveal)
  }
  return row
}

// ---- toolbar + list -----------------------------------------------------
export function renderAccounts(): void {
  const el = tabListEl()
  el.replaceChildren()
  el.className = 'tab-list accounts-list-wrap'

  // toolbar (kind filter chips)
  const bar = (<div class="accounts-filters" />) as HTMLDivElement
  ;(['all', 'account', 'secret'] as const).forEach((k) => {
    const b = (
      <button class={'bookmarks-filter' + (k === kindFilter ? ' active' : '')}>
        {k === 'all' ? 'All' : k === 'account' ? 'Accounts' : 'Secrets'}
      </button>
    ) as HTMLButtonElement
    b.addEventListener('click', () => {
      kindFilter = k
      renderAccounts()
    })
    bar.appendChild(b)
  })
  el.appendChild(bar)

  const items = filterEntries()
  if (!items.length) {
    el.insertAdjacentHTML(
      'beforeend',
      `<div class="empty-hint">${
        accountRepo.getAll().length === 0
          ? 'No accounts yet. Use the + buttons below to add an account or secret.'
          : 'No matches'
      }</div>`
    )
    return
  }
  const list = (<div class="accounts-list" />) as HTMLDivElement
  items.forEach((a) => list.appendChild(accountCard(a)))
  el.appendChild(list)
}

export function accountsApplyQuery(q: string): void {
  query = q
  renderAccounts()
}

export function initAccounts(): void {
  document.getElementById('accounts-new-entry')?.addEventListener('click', () => showAccountForm(undefined, 'account'))
  document.getElementById('accounts-new-secret')?.addEventListener('click', () => showAccountForm(undefined, 'secret'))
  document.getElementById('accounts-settings-btn')?.addEventListener('click', () => {
    // settings.openSettings — imported lazily from main.ts to avoid an import cycle
    document.getElementById('settings-btn')?.dispatchEvent(new MouseEvent('click'))
  })
}
