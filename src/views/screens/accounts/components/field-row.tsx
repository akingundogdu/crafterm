import { Component } from '@geajs/core'
import type { AccountField } from '@views/types/types'
import { UITexts } from '@texts'
import { secretsService } from '@services'
import { copyToClipboard } from '@ui/screens/accounts/accounts.state'

// One field row on an account card. Secret values are masked and revealed on
// demand via component-local reactive state (the legacy version toggled the DOM
// node imperatively; gea re-renders from `shown`/`shownValue`).
export default class FieldRow extends Component {
  declare props: { entryId: string; field: AccountField }
  shown = false
  shownValue = ''

  private onCopy = async (e: MouseEvent): Promise<void> => {
    const copy = e.currentTarget as HTMLButtonElement
    const f = this.props.field
    let v = f.value ?? ''
    if (f.secret) {
      const stored = await secretsService.get(this.props.entryId, f.key)
      if (stored == null) {
        copy.textContent = UITexts.Accounts.unavailable
        setTimeout(() => (copy.textContent = 'Copy'), 1100)
        return
      }
      v = stored
    }
    void copyToClipboard(v, copy)
  }

  private toggleReveal = async (): Promise<void> => {
    if (this.shown) {
      this.shown = false
      this.shownValue = ''
      return
    }
    const stored = await secretsService.get(this.props.entryId, this.props.field.key)
    this.shownValue = stored ?? UITexts.Accounts.notStored
    this.shown = true
  }

  template({ field: f }: this['props']) {
    const display = f.secret ? (this.shown ? this.shownValue : '••••••••') : f.value ?? ''
    return (
      <div class="accounts-meta-row">
        <span class="accounts-meta-key">{f.key}</span>
        <span class={'accounts-meta-val' + (f.secret ? ' accounts-secret' : '')}>{display}</span>
        <button class="accounts-action small" onClick={this.onCopy}>
          Copy
        </button>
        {f.secret && (
          <button class="accounts-action small" onClick={this.toggleReveal}>
            {this.shown ? UITexts.Accounts.hide : UITexts.Accounts.show}
          </button>
        )}
      </div>
    )
  }
}
