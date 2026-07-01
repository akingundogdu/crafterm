import { Component } from '@geajs/core'
import type { AccountEntry } from '@views/types/types'
import { UITexts } from '@texts'
import { accountRepo } from '@repositories'
import { promptConfirm } from '@views/components/dialog/confirm'
import { copyToClipboard } from '@views/screens/accounts/accounts.util'
import { openAccountForm } from './account-form.open'
import FieldRow from './field-row'
import store from '../accounts.store'

// gea port of the account/secret card. Edit opens the gea account form with the
// RAW repo object (the draft clones it); delete goes through the store.
export default class AccountCard extends Component {
  declare props: { entry: AccountEntry }

  private raw = (): AccountEntry =>
    accountRepo.getAll().find((a) => a.id === this.props.entry.id) ?? this.props.entry

  private onDelete = async (): Promise<void> => {
    const a = this.props.entry
    const ok = await promptConfirm({
      title: UITexts.Accounts.deleteTitle,
      message: a.label,
      confirmText: UITexts.Accounts.deleteConfirm
    })
    if (ok) store.remove(a.id)
  }

  private metaCopy = (value: string) => (e: MouseEvent) =>
    void copyToClipboard(value, e.currentTarget as HTMLButtonElement)

  template({ entry: a }: this['props']) {
    const hasMeta = !!(a.login || a.url || a.notes)
    return (
      <div class={'accounts-card accounts-kind-' + a.kind}>
        <div class="accounts-head">
          <span class={'accounts-badge ' + a.kind}>
            {a.kind === 'secret' ? 'SECRET' : (a.service || 'ACCOUNT').toUpperCase()}
          </span>
          <span class="accounts-label">{a.label}</span>
        </div>
        {hasMeta && (
          <div class="accounts-metadata">
            {a.login && (
              <div class="accounts-meta-row">
                <span class="accounts-meta-key">login</span>
                <span class="accounts-meta-val">{a.login}</span>
                <button class="accounts-action small" onClick={this.metaCopy(a.login)}>
                  Copy
                </button>
              </div>
            )}
            {a.url && (
              <div class="accounts-meta-row">
                <span class="accounts-meta-key">url</span>
                <span class="accounts-meta-val">{a.url}</span>
                <button class="accounts-action small" onClick={this.metaCopy(a.url)}>
                  Copy
                </button>
              </div>
            )}
            {a.notes && (
              <div class="accounts-meta-row">
                <span class="accounts-meta-key">notes</span>
                <span class="accounts-meta-val">{a.notes}</span>
              </div>
            )}
          </div>
        )}
        {a.fields && a.fields.length > 0 && (
          <div class="accounts-fields">
            {a.fields.map((f) => (
              <FieldRow key={f.key} entryId={a.id} field={f} />
            ))}
          </div>
        )}
        {a.tags.length > 0 && (
          <div class="accounts-tags">
            {a.tags.map((t) => (
              <span key={t} class="accounts-tag">
                {t}
              </span>
            ))}
          </div>
        )}
        <div class="accounts-actions">
          <button class="accounts-action" onClick={() => openAccountForm(this.raw(), undefined, () => store.reload())}>
            Edit
          </button>
          <button class="accounts-action button-danger" onClick={this.onDelete}>
            Delete
          </button>
        </div>
      </div>
    )
  }
}
