import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { FormField } from './account-form.types'
import store from './account-form.store'

// One editable field row in the gea account form: key + value inputs, a secret
// toggle, and a delete button (the gea port of the legacy field-item widget). The
// parent store owns the pending/draft state; typing mutates the row in place, the
// secret toggle / delete reassign the list to re-render. Secret values bind to
// `rawValue` (masked as a password) so an in-progress secret survives a parent
// re-render without leaking into the draft. Self-contained — no @ui (§2.7).
export default class FormFieldRow extends Component {
  declare props: { field: FormField; index: number }

  template({ field, index }: this['props']) {
    const f = field
    const valuePlaceholder = f.secret
      ? f.existed
        ? UITexts.Accounts.form.keepExisting
        : UITexts.Accounts.form.newSecret
      : UITexts.Accounts.form.value
    return (
      <div class="accounts-form-field-row">
        <input
          type="text"
          value={f.key}
          placeholder={UITexts.Accounts.form.keyPlaceholder}
          onInput={(e: Event) => store.setKey(index, (e.target as HTMLInputElement).value)}
          onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
        />
        <input
          type={f.secret ? 'password' : 'text'}
          value={f.secret ? f.rawValue : f.value}
          placeholder={valuePlaceholder}
          onInput={(e: Event) => store.setValue(index, (e.target as HTMLInputElement).value)}
          onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
        />
        <label class="accounts-form-secret">
          <input type="checkbox" checked={f.secret} onChange={() => store.toggleSecret(index)} />
          {' secret'}
        </label>
        <button class="accounts-action small button-danger" type="button" onClick={() => store.removeField(index)}>
          ✕
        </button>
      </div>
    )
  }
}
