import { Store } from '@geajs/core'
import type { Stash } from './git.types'

// Reactive state for the git stash manager. Both `stashes` (the loaded list) and
// `search` are read directly in the list view's template(), so gea re-renders it on
// every keystroke AND after a drop-stash reload — the daily-plan.store pattern (a
// bare rev counter read via `void store.rev` is NOT tracked by the gea compiler, so
// the mutated list must be a real reactive field the template actually reads).
class StashStore extends Store {
  stashes: Stash[] = []
  search = ''

  reset(): void {
    this.stashes = []
    this.search = ''
  }

  setStashes(stashes: Stash[]): void {
    this.stashes = stashes
  }

  setSearch(search: string): void {
    this.search = search
  }
}

export default new StashStore()
