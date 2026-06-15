import type { AccountEntry, AccountField } from './types'
import { settings, uid } from './state'
import { persistence } from './services/storage/persistence.service'
import { makeCloseButton, promptConfirm } from './dialog'
import { secretsService } from './services/ipc'

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
  t.className = 'acc-tag'
  t.textContent = text
  return t
}

function filterEntries(): AccountEntry[] {
  const q = query.trim().toLowerCase()
  return settings.accounts
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
  el.className = 'acc-card acc-kind-' + a.kind

  const head = document.createElement('div')
  head.className = 'acc-head'
  const badge = document.createElement('span')
  badge.className = 'acc-badge ' + a.kind
  badge.textContent = a.kind === 'secret' ? 'SECRET' : (a.service || 'ACCOUNT').toUpperCase()
  const label = document.createElement('span')
  label.className = 'acc-label'
  label.textContent = a.label
  head.append(badge, label)
  el.appendChild(head)

  const meta = document.createElement('div')
  meta.className = 'acc-meta'
  if (a.login) meta.append(metaRow('login', a.login, true))
  if (a.url) meta.append(metaRow('url', a.url, true))
  if (a.notes) meta.append(metaRow('notes', a.notes, false))
  if (meta.childElementCount) el.appendChild(meta)

  if (a.fields?.length) {
    const fields = document.createElement('div')
    fields.className = 'acc-fields'
    a.fields.forEach((f) => fields.appendChild(fieldRow(a, f)))
    el.appendChild(fields)
  }

  if (a.tags.length) {
    const tags = document.createElement('div')
    tags.className = 'acc-tags'
    a.tags.forEach((t) => tags.appendChild(tagChip(t)))
    el.appendChild(tags)
  }

  const acts = document.createElement('div')
  acts.className = 'acc-actions'
  const edit = document.createElement('button')
  edit.className = 'acc-act'
  edit.textContent = 'Edit'
  edit.addEventListener('click', () => showAccountForm(a))
  const del = document.createElement('button')
  del.className = 'acc-act danger'
  del.textContent = 'Delete'
  del.addEventListener('click', async () => {
    const ok = await promptConfirm({
      title: 'Delete entry',
      message: a.label,
      confirmText: 'Delete'
    })
    if (!ok) return
    settings.accounts = settings.accounts.filter((x) => x.id !== a.id)
    await secretsService.delete(a.id)
    persistence.save()
    renderAccounts()
  })
  acts.append(edit, del)
  el.appendChild(acts)
  return el
}

function metaRow(label: string, value: string, copyable: boolean): HTMLElement {
  const row = document.createElement('div')
  row.className = 'acc-meta-row'
  const lab = document.createElement('span')
  lab.className = 'acc-meta-key'
  lab.textContent = label
  const val = document.createElement('span')
  val.className = 'acc-meta-val'
  val.textContent = value
  row.append(lab, val)
  if (copyable) {
    const copy = document.createElement('button')
    copy.className = 'acc-act small'
    copy.textContent = 'Copy'
    copy.addEventListener('click', () => void copyToClipboard(value, copy))
    row.append(copy)
  }
  return row
}

function fieldRow(a: AccountEntry, f: AccountField): HTMLElement {
  const row = document.createElement('div')
  row.className = 'acc-meta-row'
  const lab = document.createElement('span')
  lab.className = 'acc-meta-key'
  lab.textContent = f.key
  const val = document.createElement('span')
  val.className = 'acc-meta-val' + (f.secret ? ' acc-secret' : '')
  val.textContent = f.secret ? '••••••••' : f.value ?? ''
  row.append(lab, val)
  const copy = document.createElement('button')
  copy.className = 'acc-act small'
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
    reveal.className = 'acc-act small'
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

// ---- form ---------------------------------------------------------------
function showAccountForm(existing?: AccountEntry, defaultKind: 'account' | 'secret' = 'account'): void {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal acc-form'
  overlay.appendChild(modal)
  const close = (): void => overlay.remove()
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  modal.appendChild(makeCloseButton(close))

  const kind: 'account' | 'secret' = existing?.kind ?? defaultKind
  const h = document.createElement('h2')
  h.textContent = existing ? `Edit ${kind}` : `New ${kind}`
  modal.appendChild(h)

  // Working draft. We commit to settings.accounts only on Save.
  const draft: AccountEntry = existing
    ? { ...existing, tags: existing.tags.slice(), fields: existing.fields.map((f) => ({ ...f })) }
    : {
        id: uid('acc'),
        kind,
        label: '',
        tags: [],
        fields: kind === 'secret' ? [{ key: 'value', value: '', secret: true }] : [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

  const field = (label: string, val: string, placeholder: string, onChange: (v: string) => void, opts?: { multiline?: boolean }): HTMLElement => {
    const wrap = document.createElement('div')
    wrap.className = 'field'
    wrap.innerHTML = `<label>${label}</label>`
    const input = opts?.multiline ? document.createElement('textarea') : document.createElement('input')
    if (input instanceof HTMLInputElement) input.type = 'text'
    if (input instanceof HTMLTextAreaElement) input.rows = 3
    input.value = val
    ;(input as HTMLInputElement | HTMLTextAreaElement).placeholder = placeholder
    input.addEventListener('input', () => onChange((input as HTMLInputElement | HTMLTextAreaElement).value))
    input.addEventListener('keydown', (e) => e.stopPropagation())
    wrap.appendChild(input)
    return wrap
  }

  modal.appendChild(field('Label', draft.label, kind === 'secret' ? 'GH_TOKEN' : 'Personal GitHub', (v) => (draft.label = v)))
  if (kind === 'account') {
    modal.appendChild(field('Service', draft.service ?? '', 'GitHub, AWS, npm…', (v) => (draft.service = v.trim() || undefined)))
    modal.appendChild(field('Login', draft.login ?? '', 'username or email', (v) => (draft.login = v.trim() || undefined)))
    modal.appendChild(field('URL', draft.url ?? '', 'https://…', (v) => (draft.url = v.trim() || undefined)))
  }
  modal.appendChild(field('Tags (comma separated)', draft.tags.join(', '), 'crafterm, mobile', (v) => {
    draft.tags = v.split(',').map((s) => s.trim()).filter(Boolean)
  }))
  modal.appendChild(field('Notes', draft.notes ?? '', 'free-form', (v) => (draft.notes = v.trim() || undefined), { multiline: true }))

  // Fields section: key/value with a secret toggle. Secret values are NOT
  // round-tripped through `draft` — they go to safeStorage on save.
  modal.insertAdjacentHTML('beforeend', '<div class="field"><label>Fields</label></div>')
  const fieldsList = document.createElement('div')
  fieldsList.className = 'acc-form-fields'
  modal.appendChild(fieldsList)
  type Pending = { key: string; rawValue: string; secret: boolean; existed: boolean }
  const pending: Pending[] = draft.fields.map((f) => ({ key: f.key, rawValue: '', secret: !!f.secret, existed: !!existing }))

  const renderFields = (): void => {
    fieldsList.replaceChildren()
    pending.forEach((p, idx) => {
      const row = document.createElement('div')
      row.className = 'acc-form-field-row'
      const keyI = document.createElement('input')
      keyI.type = 'text'
      keyI.placeholder = 'key (e.g. api_token)'
      keyI.value = p.key
      keyI.addEventListener('input', () => (p.key = keyI.value))
      keyI.addEventListener('keydown', (e) => e.stopPropagation())
      const valI = document.createElement('input')
      valI.type = p.secret ? 'password' : 'text'
      valI.placeholder = p.secret ? (p.existed ? '(keep existing — type to replace)' : 'new secret value') : 'value'
      valI.value = p.secret ? '' : (draft.fields[idx]?.value ?? '')
      valI.addEventListener('input', () => {
        p.rawValue = valI.value
        if (!p.secret) draft.fields[idx].value = valI.value
      })
      valI.addEventListener('keydown', (e) => e.stopPropagation())
      const secretChk = document.createElement('label')
      secretChk.className = 'acc-form-secret'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = p.secret
      cb.addEventListener('change', () => {
        p.secret = cb.checked
        renderFields()
      })
      secretChk.append(cb, document.createTextNode(' secret'))
      const del = document.createElement('button')
      del.type = 'button'
      del.className = 'acc-act small danger'
      del.textContent = '✕'
      del.addEventListener('click', () => {
        pending.splice(idx, 1)
        draft.fields.splice(idx, 1)
        renderFields()
      })
      row.append(keyI, valI, secretChk, del)
      fieldsList.appendChild(row)
    })
    const addBtn = document.createElement('button')
    addBtn.type = 'button'
    addBtn.className = 'settings-inline-btn'
    addBtn.textContent = '+ Add field'
    addBtn.addEventListener('click', () => {
      pending.push({ key: '', rawValue: '', secret: false, existed: false })
      draft.fields.push({ key: '', value: '', secret: false })
      renderFields()
    })
    fieldsList.appendChild(addBtn)
  }
  renderFields()

  // actions
  const actions = document.createElement('div')
  actions.className = 'modal-actions'
  const cancel = document.createElement('button')
  cancel.textContent = 'Cancel'
  cancel.addEventListener('click', close)
  const save = document.createElement('button')
  save.className = 'primary'
  save.textContent = existing ? 'Save' : 'Add'
  save.addEventListener('click', async () => {
    if (!draft.label.trim()) return
    // Sync the secret flag onto the stored field; for secrets, drop any stale
    // plaintext from `value` so we never round-trip it through JSON.
    draft.fields = pending.map((p, i) => ({
      key: p.key.trim() || `field_${i + 1}`,
      secret: p.secret,
      value: p.secret ? undefined : (draft.fields[i]?.value ?? '')
    }))
    draft.updatedAt = Date.now()
    // Persist secret values via safeStorage IPC. Skip if no new value typed —
    // keeps the existing stored secret intact.
    for (const p of pending) {
      if (!p.secret) continue
      if (!p.rawValue) continue
      const key = p.key.trim()
      if (!key) continue
      await secretsService.set(draft.id, key, p.rawValue)
    }
    if (existing) {
      const i = settings.accounts.findIndex((x) => x.id === existing.id)
      if (i >= 0) settings.accounts[i] = draft
    } else {
      settings.accounts.unshift(draft)
    }
    persistence.save()
    close()
    renderAccounts()
  })
  actions.append(cancel, save)
  modal.appendChild(actions)
  document.body.appendChild(overlay)
}

// ---- toolbar + list -----------------------------------------------------
export function renderAccounts(): void {
  const el = tabListEl()
  el.replaceChildren()
  el.className = 'tab-list acc-list-wrap'

  // toolbar (kind filter chips)
  const bar = document.createElement('div')
  bar.className = 'acc-filters'
  ;(['all', 'account', 'secret'] as const).forEach((k) => {
    const b = document.createElement('button')
    b.className = 'bm-filter' + (k === kindFilter ? ' active' : '')
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
        settings.accounts.length === 0
          ? 'No accounts yet. Use the + buttons below to add an account or secret.'
          : 'No matches'
      }</div>`
    )
    return
  }
  const list = document.createElement('div')
  list.className = 'acc-list'
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
