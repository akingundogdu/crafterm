import './accounts.css'
import type { AccountEntry, AccountField } from '../../types'
import { accountRepo } from '../../services/storage/repositories'
import { promptConfirm } from '../../dialog'
import { secretsService } from '../../services/ipc'
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
  const t = document.createElement('span')
  t.className = 'accounts-tag'
  t.textContent = text
  return t
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
  const el = document.createElement('div')
  el.className = 'accounts-card accounts-kind-' + a.kind

  const head = document.createElement('div')
  head.className = 'accounts-head'
  const badge = document.createElement('span')
  badge.className = 'accounts-badge ' + a.kind
  badge.textContent = a.kind === 'secret' ? 'SECRET' : (a.service || 'ACCOUNT').toUpperCase()
  const label = document.createElement('span')
  label.className = 'accounts-label'
  label.textContent = a.label
  head.append(badge, label)
  el.appendChild(head)

  const meta = document.createElement('div')
  meta.className = 'accounts-meta'
  if (a.login) meta.append(metaRow('login', a.login, true))
  if (a.url) meta.append(metaRow('url', a.url, true))
  if (a.notes) meta.append(metaRow('notes', a.notes, false))
  if (meta.childElementCount) el.appendChild(meta)

  if (a.fields?.length) {
    const fields = document.createElement('div')
    fields.className = 'accounts-fields'
    a.fields.forEach((f) => fields.appendChild(fieldRow(a, f)))
    el.appendChild(fields)
  }

  if (a.tags.length) {
    const tags = document.createElement('div')
    tags.className = 'accounts-tags'
    a.tags.forEach((t) => tags.appendChild(tagChip(t)))
    el.appendChild(tags)
  }

  const acts = document.createElement('div')
  acts.className = 'accounts-actions'
  const edit = document.createElement('button')
  edit.className = 'accounts-act'
  edit.textContent = 'Edit'
  edit.addEventListener('click', () => showAccountForm(a))
  const del = document.createElement('button')
  del.className = 'accounts-act button-danger'
  del.textContent = 'Delete'
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
  acts.append(edit, del)
  el.appendChild(acts)
  return el
}

function metaRow(label: string, value: string, copyable: boolean): HTMLElement {
  const row = document.createElement('div')
  row.className = 'accounts-meta-row'
  const lab = document.createElement('span')
  lab.className = 'accounts-meta-key'
  lab.textContent = label
  const val = document.createElement('span')
  val.className = 'accounts-meta-val'
  val.textContent = value
  row.append(lab, val)
  if (copyable) {
    const copy = document.createElement('button')
    copy.className = 'accounts-act small'
    copy.textContent = 'Copy'
    copy.addEventListener('click', () => void copyToClipboard(value, copy))
    row.append(copy)
  }
  return row
}

function fieldRow(a: AccountEntry, f: AccountField): HTMLElement {
  const row = document.createElement('div')
  row.className = 'accounts-meta-row'
  const lab = document.createElement('span')
  lab.className = 'accounts-meta-key'
  lab.textContent = f.key
  const val = document.createElement('span')
  val.className = 'accounts-meta-val' + (f.secret ? ' accounts-secret' : '')
  val.textContent = f.secret ? '••••••••' : f.value ?? ''
  row.append(lab, val)
  const copy = document.createElement('button')
  copy.className = 'accounts-act small'
  copy.textContent = 'Copy'
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
    const reveal = document.createElement('button')
    reveal.className = 'accounts-act small'
    reveal.textContent = 'Show'
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
  const bar = document.createElement('div')
  bar.className = 'accounts-filters'
  ;(['all', 'account', 'secret'] as const).forEach((k) => {
    const b = document.createElement('button')
    b.className = 'bookmarks-filter' + (k === kindFilter ? ' active' : '')
    b.textContent = k === 'all' ? 'All' : k === 'account' ? 'Accounts' : 'Secrets'
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
  const list = document.createElement('div')
  list.className = 'accounts-list'
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
