import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import { filterAccounts, makeAccountRowClick } from '../claude.store'
import store from '../claude-accounts.store'
import AccountRow from './account-row'

// Reactive body of the Claude account switcher: heading, and — only when any
// `claude-switch-*` commands were discovered — the search box and the live-filtered
// account list. With none configured it shows the code hint instead (no search box,
// matching the imperative original). Rendered as a JSX child of ClaudeAccountsView
// so gea tracks its store reads and re-renders it on every keystroke and once the
// async load lands — the board pattern.
class ClaudeAccountsList extends Component {
  declare props: { close: () => void }

  template({ close }: this['props']) {
    // Read the reactive store fields (the discovered accounts + the search) so this
    // child re-renders on any keystroke and after the async load.
    const all = store.accounts
    const items = filterAccounts(all, store.search)

    return (
      <div class="claude-accounts-picker">
        <h2>{UITexts.Pickers.claude.switchAccountHeading}</h2>
        {all.length === 0 && (
          <div class="empty-hint">
            No <code>claude-switch-*</code> commands found in your zsh config.
          </div>
        )}
        {all.length > 0 && (
          <input
            class="search-box-input"
            type="text"
            spellcheck="false"
            placeholder="Search accounts…"
            value={store.search}
            onInput={(e: Event) => store.setSearch((e.target as HTMLInputElement).value)}
          />
        )}
        {all.length > 0 && (
          <div class="pick-list">
            {items.map((a) => (
              <AccountRow key={a.name} account={a} onClick={makeAccountRowClick(a.name, a.label, close)} />
            ))}
            {items.length === 0 && <div class="empty-hint">No matches</div>}
          </div>
        )}
      </div>
    )
  }
}

// Thin shell for the account switcher, mounted imperatively into the shared overlay
// modal. The modal's close fn arrives via the constructor into a plain field — a gea
// Component only populates `this.props` when rendered from a parent template, not
// from a manual `new X()`. The reactive markup lives in the ClaudeAccountsList JSX
// child.
export default class ClaudeAccountsView extends Component {
  private readonly closeFn: () => void

  constructor(opts: { close: () => void }) {
    super()
    this.closeFn = opts.close
  }

  template() {
    return <ClaudeAccountsList close={this.closeFn} />
  }
}
