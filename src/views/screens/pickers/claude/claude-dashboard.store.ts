import { Store } from '@geajs/core'
import type { ClaudeSession } from './claude.types'
import { collectSessions } from './claude.store'

// Reactive state for the live Claude sessions dashboard. `sessions` (recollected
// from the live panes on the 1s timer) and `search` are read directly in the
// dashboard view's template(), so gea re-renders it on every keystroke AND on each
// timer refresh — the daily-plan.store pattern (a bare rev counter read via
// `void store.rev` is NOT tracked by the gea compiler, so the mutated list is a
// real reactive field the template actually reads).
class ClaudeDashboardStore extends Store {
  sessions: ClaudeSession[] = []
  search = ''

  reset(): void {
    this.sessions = []
    this.search = ''
  }

  refresh(): void {
    this.sessions = collectSessions()
  }

  setSearch(search: string): void {
    this.search = search
  }
}

export default new ClaudeDashboardStore()
