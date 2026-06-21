import { createOverlay, createButton, createInput, createTextarea, createField } from '@ui/components'
import { UITexts } from '@texts'
import type { AccountEntry } from '@ui/types/types'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { renderAccounts } from '../accounts'
import { createAccountDraft, initialPending, makeSaveAccount } from './account-form.state'
import { fieldItem } from './field-item'

// Create/edit an account or secret. Secret field values never round-trip through
// the draft/JSON — they go to safeStorage via the secrets service on save. The
// field editor stays here as a closure over the mutable draft/pending state; the
// draft seed and save logic live in account-form.state.
export function showAccountForm(
  existing?: AccountEntry,
  defaultKind: 'account' | 'secret' = 'account'
): void {
  const ov = createOverlay({ closeOnBackdrop: true })

  const kind: 'account' | 'secret' = existing?.kind ?? defaultKind
  const draft = createAccountDraft(existing, kind)

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
  const pending = initialPending(draft, existing)

  const renderFields = (): void => {
    fieldsList.replaceChildren()
    pending.forEach((p, idx) => {
      const row = fieldItem({
        pending: p,
        initialValue: draft.fields[idx]?.value ?? '',
        onKeyInput: (v) => (p.key = v),
        onValueInput: (v) => {
          p.rawValue = v
          if (!p.secret) draft.fields[idx].value = v
        },
        onSecretToggle: (secret) => {
          p.secret = secret
          renderFields()
        },
        onDelete: () => {
          pending.splice(idx, 1)
          draft.fields.splice(idx, 1)
          renderFields()
        }
      })
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
      onClick: makeSaveAccount(draft, pending, ov.close, renderAccounts)
    })
  )

  // Fields section: key/value with a secret toggle. Secret values are NOT
  // round-tripped through `draft` — they go to safeStorage on save.
  const modal = (
    <div class="modal accounts-form">
      {makeCloseButton(ov.close)}
      <h2>{existing ? UITexts.Accounts.form.editTitle(kind) : UITexts.Accounts.form.newTitle(kind)}</h2>
      {field('Label', draft.label, kind === 'secret' ? 'GH_TOKEN' : 'Personal GitHub', (v) => (draft.label = v))}
      {kind === 'account' &&
        field('Service', draft.service ?? '', 'GitHub, AWS, npm…', (v) => (draft.service = v.trim() || undefined))}
      {kind === 'account' &&
        field('Login', draft.login ?? '', 'username or email', (v) => (draft.login = v.trim() || undefined))}
      {kind === 'account' && field('URL', draft.url ?? '', 'https://…', (v) => (draft.url = v.trim() || undefined))}
      {field('Tags (comma separated)', draft.tags.join(', '), 'crafterm, mobile', (v) => {
        draft.tags = v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
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
