import { Component } from '@geajs/core'
import type { ClaudeAccount } from '../claude.types'

export interface AccountRowProps {
  account: ClaudeAccount
  onClick: () => void
}

// One row in the Claude account switcher: the account label, plus its underlying
// command/value as a subline when present. Rendered as a keyed JSX child of the
// list, so gea populates `this.props`; the run-in-terminal handler is passed in
// already bound.
export default class AccountRow extends Component {
  declare props: AccountRowProps

  template({ account, onClick }: this['props']) {
    const a = account
    return (
      <button class="pick-row project-row" onClick={onClick}>
        <span class="picker-name">{a.label}</span>
        {a.value ? <span class="project-sub">{a.value}</span> : null}
      </button>
    )
  }
}
