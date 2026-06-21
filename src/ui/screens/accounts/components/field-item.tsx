import { createButton, createInput } from '@ui/components'
import { UITexts } from '@texts'
import type { PendingField } from './account-form.types'

// One editable field row in the account form: key + value inputs, a secret
// toggle, and a delete button. Pure factory — all mutation flows back through the
// injected callbacks; the parent owns the pending/draft state and re-renders.
export function fieldItem(opts: {
  pending: PendingField
  initialValue: string
  onKeyInput: (v: string) => void
  onValueInput: (v: string) => void
  onSecretToggle: (secret: boolean) => void
  onDelete: () => void
}): HTMLElement {
  const p = opts.pending
  const keyI = createInput({ value: p.key, placeholder: UITexts.Accounts.form.keyPlaceholder })
  keyI.addEventListener('input', () => opts.onKeyInput(keyI.value))
  keyI.addEventListener('keydown', (e) => e.stopPropagation())
  const valI = createInput({
    value: p.secret ? '' : opts.initialValue,
    placeholder: p.secret
      ? p.existed
        ? UITexts.Accounts.form.keepExisting
        : UITexts.Accounts.form.newSecret
      : UITexts.Accounts.form.value,
    type: p.secret ? 'password' : 'text'
  })
  valI.addEventListener('input', () => opts.onValueInput(valI.value))
  valI.addEventListener('keydown', (e) => e.stopPropagation())
  const cb = (<input type="checkbox" onChange={() => opts.onSecretToggle(cb.checked)} />) as HTMLInputElement
  cb.checked = p.secret
  const secretChk = (<label class="accounts-form-secret" />) as HTMLLabelElement
  secretChk.append(cb, document.createTextNode(' secret'))
  const del = createButton({
    text: '✕',
    className: 'accounts-action small danger',
    type: 'button',
    onClick: opts.onDelete
  })
  const row = (<div class="accounts-form-field-row" />) as HTMLDivElement
  row.append(keyI, valI, secretChk, del)
  return row
}
