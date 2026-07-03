import { Store } from '@geajs/core'

// Reactive state for the branch-checkout picker. `branches` (the loaded list),
// `search`, and `sel` (the keyboard/hover highlight index) are all read directly in
// the list view's template(), so gea re-renders it on every keystroke, arrow-key nav
// and hover — the daily-plan.store pattern (a bare rev counter read via `void
// store.rev` is NOT tracked by the gea compiler, so the highlight/list must be real
// reactive fields the template actually reads and uses).
class BranchStore extends Store {
  branches: string[] = []
  search = ''
  sel = 0

  reset(): void {
    this.branches = []
    this.search = ''
    this.sel = 0
  }

  setBranches(branches: string[]): void {
    this.branches = branches
  }

  setSearch(search: string): void {
    this.search = search
    this.sel = 0
  }

  setSel(sel: number): void {
    this.sel = sel
  }
}

export default new BranchStore()
