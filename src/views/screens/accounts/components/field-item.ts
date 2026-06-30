import { el } from '@views/lib/dom'
import { UITexts } from '@texts'
import type { PendingField } from './account-form.types'

// One editable field row in the account form: key + value inputs, a secret
// toggle, and a delete button. Plain-DOM (imperative widget; the parent owns the
// pending/draft state + re-render). Self-contained — no @ui (§2.7).
export function fieldItem(opts: {
  pending: PendingField
  initialValue: string
  onKeyInput: (v: string) => void
  onValueInput: (v: string) => void
  onSecretToggle: (secret: boolean) => void
  onDelete: () => void
}): HTMLElement {
  const p = opts.pending
  const keyI = el('input', {
    value: p.key,
    placeholder: UITexts.Accounts.form.keyPlaceholder,
    onInput: (e: Event) => opts.onKeyInput((e.target as HTMLInputElement).value),
    onKeydown: (e: Event) => e.stopPropagation()
  })
  const valI = el('input', {
    value: p.secret ? '' : opts.initialValue,
    type: p.secret ? 'password' : 'text',
    placeholder: p.secret
      ? p.existed
        ? UITexts.Accounts.form.keepExisting
        : UITexts.Accounts.form.newSecret
      : UITexts.Accounts.form.value,
    onInput: (e: Event) => opts.onValueInput((e.target as HTMLInputElement).value),
    onKeydown: (e: Event) => e.stopPropagation()
  })
  const cb = el('input', { type: 'checkbox', onChange: () => opts.onSecretToggle(cb.checked) })
  cb.checked = p.secret
  const secretChk = el('label', { class: 'accounts-form-secret' }, cb, ' secret')
  const del = el('button', { class: 'accounts-action small danger', type: 'button', onClick: opts.onDelete }, '✕')
  return el('div', { class: 'accounts-form-field-row' }, keyI, valI, secretChk, del)
}
