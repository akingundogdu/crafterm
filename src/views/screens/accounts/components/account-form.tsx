import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import '@views/components/form-field/form-field.css'
import FormFieldRow from './form-field-row'
import store from './account-form.store'

// gea account/secret add-edit form body, mounted into the @views overlay backdrop
// by openAccountForm. Renders the `.modal.accounts-form` shell: the scalar fields
// (label always; service/login/url only for accounts; tags + notes always), the
// `.accounts-form-fields` dynamic list (one FormFieldRow per pending field + the
// `+ Add field` button), and the Cancel / Add-or-Save actions. The close button is
// rendered inline so it stays a direct child of `.modal` across the store's
// reactive re-renders. State + persistence live in the store. Self-contained — no
// @ui (§2.7).
export default class AccountForm extends Component {
  template() {
    return (
      <div class="modal accounts-form">
        <button
          class="modal-close"
          type="button"
          aria-label="Close"
          title="Close (Esc)"
          onClick={() => store.close()}
        >
          ×
        </button>
        <h2>{store.titleText}</h2>
        <div class="field">
          <label>Label</label>
          <input
            type="text"
            value={store.label}
            placeholder={store.kind === 'secret' ? 'GH_TOKEN' : 'Personal GitHub'}
            onInput={(e: Event) => (store.label = (e.target as HTMLInputElement).value)}
            onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
          />
        </div>
        {store.isAccount && (
          <div class="field">
            <label>Service</label>
            <input
              type="text"
              value={store.service}
              placeholder="GitHub, AWS, npm…"
              onInput={(e: Event) => (store.service = (e.target as HTMLInputElement).value)}
              onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
            />
          </div>
        )}
        {store.isAccount && (
          <div class="field">
            <label>Login</label>
            <input
              type="text"
              value={store.login}
              placeholder="username or email"
              onInput={(e: Event) => (store.login = (e.target as HTMLInputElement).value)}
              onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
            />
          </div>
        )}
        {store.isAccount && (
          <div class="field">
            <label>URL</label>
            <input
              type="text"
              value={store.url}
              placeholder="https://…"
              onInput={(e: Event) => (store.url = (e.target as HTMLInputElement).value)}
              onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
            />
          </div>
        )}
        <div class="field">
          <label>Tags (comma separated)</label>
          <input
            type="text"
            value={store.tags}
            placeholder="crafterm, mobile"
            onInput={(e: Event) => (store.tags = (e.target as HTMLInputElement).value)}
            onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
          />
        </div>
        <div class="field">
          <label>Notes</label>
          <textarea
            rows={3}
            value={store.notes}
            placeholder="free-form"
            onInput={(e: Event) => (store.notes = (e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
          />
        </div>
        <div class="field">
          <label>{UITexts.Accounts.form.fields}</label>
        </div>
        <div class="accounts-form-fields">
          {store.fields.map((f, i) => (
            <FormFieldRow key={f.id} field={f} index={i} />
          ))}
          <button class="settings-inline-btn" type="button" onClick={() => store.addField()}>
            + Add field
          </button>
        </div>
        <div class="modal-actions">
          <button onClick={() => store.close()}>{UITexts.Accounts.form.cancel}</button>
          <button class="button-primary" onClick={() => store.save()}>
            {store.saveLabel}
          </button>
        </div>
      </div>
    )
  }
}
