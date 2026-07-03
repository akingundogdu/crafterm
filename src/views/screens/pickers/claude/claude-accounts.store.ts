import { Store } from '@geajs/core'
import type { ClaudeAccount } from './claude.types'

// Reactive state for the Claude account switcher. `accounts` (the discovered
// `claude-switch-*` commands) and `search` are read directly in the accounts view's
// template(), so gea re-renders it on every keystroke and once the async load lands
// — the daily-plan.store pattern (no dead `void store.rev`; the mutated list is a
// real reactive field the template reads).
class ClaudeAccountsStore extends Store {
  accounts: ClaudeAccount[] = []
  search = ''

  setAccounts(accounts: ClaudeAccount[]): void {
    this.accounts = accounts
  }

  setSearch(search: string): void {
    this.search = search
  }
}

export default new ClaudeAccountsStore()
