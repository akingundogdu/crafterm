import { createOverlay, createButton, createInput, createTextarea, createField } from '@ui/components'
import type { AccountEntry } from '../../../types'
import { uid } from '../../../state'
import { accountRepo } from '../../../services/storage/repositories'
import { makeCloseButton } from '../../../dialog'
import { secretsService } from '@services'
import { renderAccounts } from '../accounts'

// Create/edit an account or secret. Secret field values never round-trip through
// the draft/JSON — they go to safeStorage via the secrets service on save.
export function showAccountForm(
  existing?: AccountEntry,
  defaultKind: 'account' | 'secret' = 'account'
): void {
  const ov = createOverlay({ closeOnBackdrop: true })
  const modal = document.createElement('div')
  modal.className = 'modal accounts-form'
  ov.overlay.appendChild(modal)
  modal.appendChild(makeCloseButton(ov.close))

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

  const field = (
    label: string,
    val: string,
    placeholder: string,
    onChange: (v: string) => void,
    opts?: { multiline?: boolean }
  ): HTMLElement => {
    const input = opts?.multiline
      ? createTextarea({ value: val, placeholder, rows: 3 })
      : createInput({ value: val, placeholder })
    input.addEventListener('input', () => onChange(input.value))
    input.addEventListener('keydown', (e) => e.stopPropagation())
    return createField(label, input)
  }

  modal.appendChild(field('Label', draft.label, kind === 'secret' ? 'GH_TOKEN' : 'Personal GitHub', (v) => (draft.label = v)))
  if (kind === 'account') {
    modal.appendChild(field('Service', draft.service ?? '', 'GitHub, AWS, npm…', (v) => (draft.service = v.trim() || undefined)))
    modal.appendChild(field('Login', draft.login ?? '', 'username or email', (v) => (draft.login = v.trim() || undefined)))
    modal.appendChild(field('URL', draft.url ?? '', 'https://…', (v) => (draft.url = v.trim() || undefined)))
  }
  modal.appendChild(
    field('Tags (comma separated)', draft.tags.join(', '), 'crafterm, mobile', (v) => {
      draft.tags = v.split(',').map((s) => s.trim()).filter(Boolean)
    })
  )
  modal.appendChild(field('Notes', draft.notes ?? '', 'free-form', (v) => (draft.notes = v.trim() || undefined), { multiline: true }))

  // Fields section: key/value with a secret toggle. Secret values are NOT
  // round-tripped through `draft` — they go to safeStorage on save.
  modal.insertAdjacentHTML('beforeend', '<div class="field"><label>Fields</label></div>')
  const fieldsList = document.createElement('div')
  fieldsList.className = 'accounts-form-fields'
  modal.appendChild(fieldsList)
  type Pending = { key: string; rawValue: string; secret: boolean; existed: boolean }
  const pending: Pending[] = draft.fields.map((f) => ({ key: f.key, rawValue: '', secret: !!f.secret, existed: !!existing }))

  const renderFields = (): void => {
    fieldsList.replaceChildren()
    pending.forEach((p, idx) => {
      const row = document.createElement('div')
      row.className = 'accounts-form-field-row'
      const keyI = createInput({ value: p.key, placeholder: 'key (e.g. api_token)' })
      keyI.addEventListener('input', () => (p.key = keyI.value))
      keyI.addEventListener('keydown', (e) => e.stopPropagation())
      const valI = createInput({
        value: p.secret ? '' : draft.fields[idx]?.value ?? '',
        placeholder: p.secret ? (p.existed ? '(keep existing — type to replace)' : 'new secret value') : 'value',
        type: p.secret ? 'password' : 'text'
      })
      valI.addEventListener('input', () => {
        p.rawValue = valI.value
        if (!p.secret) draft.fields[idx].value = valI.value
      })
      valI.addEventListener('keydown', (e) => e.stopPropagation())
      const secretChk = document.createElement('label')
      secretChk.className = 'accounts-form-secret'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = p.secret
      cb.addEventListener('change', () => {
        p.secret = cb.checked
        renderFields()
      })
      secretChk.append(cb, document.createTextNode(' secret'))
      const del = createButton({
        text: '✕',
        className: 'accounts-act small danger',
        type: 'button',
        onClick: () => {
          pending.splice(idx, 1)
          draft.fields.splice(idx, 1)
          renderFields()
        }
      })
      row.append(keyI, valI, secretChk, del)
      fieldsList.appendChild(row)
    })
    const addBtn = createButton({
      text: '+ Add field',
      className: 'settings-inline-btn',
      type: 'button',
      onClick: () => {
        pending.push({ key: '', rawValue: '', secret: false, existed: false })
        draft.fields.push({ key: '', value: '', secret: false })
        renderFields()
      }
    })
    fieldsList.appendChild(addBtn)
  }
  renderFields()

  const actions = document.createElement('div')
  actions.className = 'modal-actions'
  actions.append(
    createButton({ text: 'Cancel', onClick: ov.close }),
    createButton({
      text: existing ? 'Save' : 'Add',
      variant: 'primary',
      onClick: async () => {
        if (!draft.label.trim()) return
        // Sync the secret flag onto the stored field; for secrets, drop any stale
        // plaintext from `value` so we never round-trip it through JSON.
        draft.fields = pending.map((p, i) => ({
          key: p.key.trim() || `field_${i + 1}`,
          secret: p.secret,
          value: p.secret ? undefined : draft.fields[i]?.value ?? ''
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
        accountRepo.upsert(draft)
        ov.close()
        renderAccounts()
      }
    })
  )
  modal.appendChild(actions)
  ov.mount()
}
