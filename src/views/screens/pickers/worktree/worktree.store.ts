import { Store } from '@geajs/core'

// Reactive state for the worktree dashboard. `search` is the source of truth,
// read directly in the list view's template() so gea patches the list on every
// keystroke (the board pattern). `rev` is bumped when a refresh is forced outside
// the search field. Reset on each open so a fresh dashboard starts unfiltered.
class WorktreeStore extends Store {
  search = ''
  rev = 0

  setSearch(search: string): void {
    this.search = search
  }

  reset(): void {
    this.search = ''
  }

  bump(): void {
    this.rev++
  }
}

export default new WorktreeStore()
