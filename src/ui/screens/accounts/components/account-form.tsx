import { createOverlay, createButton, createInput, createTextarea, createField } from '@ui/components'
import { UITexts } from '@texts'
import type { AccountEntry } from '@ui/types/types'
import { uid } from '@ui/state/state'
import { accountRepo } from '@repositories'
import { makeCloseButton } from '@ui/dialog/dialog'
import { secretsService } from '@services'
import { renderAccounts } from '../accounts'

// Create/edit an account or secret. Secret field values never round-trip through
// the draft/JSON — they go to safeStorage via the secrets service on save.
export function showAccountForm(
  existing?: AccountEntry,
  defaultKind: 'account' | 'secret' = 'account'
): void {
  const ov = createOverlay({ closeOnBackdrop: true })

  const kind: 'account' | 'secret' = existing?.kind ?? defaultKind

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

  const fieldsList = (<div class="accounts-form-fields" />) as HTMLDivElement
  type Pending = { key: string; rawValue: string; secret: boolean; existed: boolean }
  const pending: Pending[] = draft.fields.map((f) => ({ key: f.key, rawValue: '', secret: !!f.secret, existed: !!existing }))

  const renderFields = (): void => {
    fieldsList.replaceChildren()
    pending.forEach((p, idx) => {
      const keyI = createInput({ value: p.key, placeholder: UITexts.Accounts.form.keyPlaceholder })
      keyI.addEventListener('input', () => (p.key = keyI.value))
      keyI.addEventListener('keydown', (e) => e.stopPropagation())
      const valI = createInput({
        value: p.secret ? '' : draft.fields[idx]?.value ?? '',
        placeholder: p.secret ? (p.existed ? UITexts.Accounts.form.keepExisting : UITexts.Accounts.form.newSecret) : UITexts.Accounts.form.value,
        type: p.secret ? 'password' : 'text'
      })
      valI.addEventListener('input', () => {
        p.rawValue = valI.value
        if (!p.secret) draft.fields[idx].value = valI.value
      })
      valI.addEventListener('keydown', (e) => e.stopPropagation())
      const cb = (<input type="checkbox" />) as HTMLInputElement
      cb.checked = p.secret
      cb.addEventListener('change', () => {
        p.secret = cb.checked
        renderFields()
      })
      const secretChk = (<label class="accounts-form-secret" />) as HTMLLabelElement
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
      const row = (<div class="accounts-form-field-row" />) as HTMLDivElement
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

  const actions = (<div class="modal-actions" />) as HTMLDivElement
  actions.append(
    createButton({ text: UITexts.Accounts.form.cancel, onClick: ov.close }),
    createButton({
      text: existing ? UITexts.Accounts.form.save : UITexts.Accounts.form.add,
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

  // Fields section: key/value with a secret toggle. Secret values are NOT
  // round-tripped through `draft` — they go to safeStorage on save.
  const modal = (
    <div class="modal accounts-form">
      {makeCloseButton(ov.close)}
      <h2>{existing ? UITexts.Accounts.form.editTitle(kind) : UITexts.Accounts.form.newTitle(kind)}</h2>
      {field('Label', draft.label, kind === 'secret' ? 'GH_TOKEN' : 'Personal GitHub', (v) => (draft.label = v))}
      {kind === 'account' && field('Service', draft.service ?? '', 'GitHub, AWS, npm…', (v) => (draft.service = v.trim() || undefined))}
      {kind === 'account' && field('Login', draft.login ?? '', 'username or email', (v) => (draft.login = v.trim() || undefined))}
      {kind === 'account' && field('URL', draft.url ?? '', 'https://…', (v) => (draft.url = v.trim() || undefined))}
      {field('Tags (comma separated)', draft.tags.join(', '), 'crafterm, mobile', (v) => {
        draft.tags = v.split(',').map((s) => s.trim()).filter(Boolean)
      })}
      {field('Notes', draft.notes ?? '', 'free-form', (v) => (draft.notes = v.trim() || undefined), { multiline: true })}
      <div class="field">
        <label>{UITexts.Accounts.form.fields}</label>
      </div>
      {fieldsList}
      {actions}
    </div>
  ) as HTMLDivElement

  ov.overlay.appendChild(modal)
  ov.mount()
}
