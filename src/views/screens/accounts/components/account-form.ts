import { el } from '@views/lib/dom'
import { createOverlay } from '@views/components/overlay/overlay'
import '@views/components/form-field/form-field.css'
import { UITexts } from '@texts'
import type { AccountEntry } from '@views/types/types'
import { createAccountDraft, initialPending, makeSaveAccount } from './account-form.state'
import { fieldItem } from './field-item'

// Create/edit an account or secret (plain-DOM imperative modal — dynamic field
// list with secret toggles; gea reactivity buys nothing). Secret field values
// never round-trip through the draft/JSON — they go to safeStorage via the
// secrets service on save. `onSaved` re-renders the list after upsert.
// Self-contained — no @ui (§2.7).
export function openAccountForm(
  existing?: AccountEntry,
  defaultKind: 'account' | 'secret' = 'account',
  onSaved: () => void = () => {}
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
      ? el('textarea', {
          placeholder,
          rows: 3,
          onInput: (e: Event) => onChange((e.target as HTMLTextAreaElement).value),
          onKeydown: (e: Event) => e.stopPropagation()
        })
      : el('input', {
          value: val,
          placeholder,
          onInput: (e: Event) => onChange((e.target as HTMLInputElement).value),
          onKeydown: (e: Event) => e.stopPropagation()
        })
    if (opts?.multiline) (input as HTMLTextAreaElement).value = val
    return el('div', { class: 'field' }, el('label', null, label), input)
  }

  const fieldsList = el('div', { class: 'accounts-form-fields' })
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
    const addBtn = el(
      'button',
      {
        class: 'settings-inline-btn',
        type: 'button',
        onClick: () => {
          pending.push({ key: '', rawValue: '', secret: false, existed: false })
          draft.fields.push({ key: '', value: '', secret: false })
          renderFields()
        }
      },
      '+ Add field'
    )
    fieldsList.appendChild(addBtn)
  }
  renderFields()

  const actions = el(
    'div',
    { class: 'modal-actions' },
    el('button', { onClick: ov.close }, UITexts.Accounts.form.cancel),
    el(
      'button',
      { class: 'button-primary', onClick: makeSaveAccount(draft, pending, ov.close, onSaved) },
      existing ? UITexts.Accounts.form.save : UITexts.Accounts.form.add
    )
  )

  const closeBtn = el(
    'button',
    { class: 'modal-close', type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', onClick: ov.close },
    '×'
  )

  const modal = el(
    'div',
    { class: 'modal accounts-form' },
    closeBtn,
    el('h2', null, existing ? UITexts.Accounts.form.editTitle(kind) : UITexts.Accounts.form.newTitle(kind)),
    field('Label', draft.label, kind === 'secret' ? 'GH_TOKEN' : 'Personal GitHub', (v) => (draft.label = v)),
    kind === 'account'
      ? field('Service', draft.service ?? '', 'GitHub, AWS, npm…', (v) => (draft.service = v.trim() || undefined))
      : null,
    kind === 'account'
      ? field('Login', draft.login ?? '', 'username or email', (v) => (draft.login = v.trim() || undefined))
      : null,
    kind === 'account' ? field('URL', draft.url ?? '', 'https://…', (v) => (draft.url = v.trim() || undefined)) : null,
    field('Tags (comma separated)', draft.tags.join(', '), 'crafterm, mobile', (v) => {
      draft.tags = v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }),
    field('Notes', draft.notes ?? '', 'free-form', (v) => (draft.notes = v.trim() || undefined), { multiline: true }),
    el('div', { class: 'field' }, el('label', null, UITexts.Accounts.form.fields)),
    fieldsList,
    actions
  )

  ov.overlay.appendChild(modal)
  ov.mount()
}
