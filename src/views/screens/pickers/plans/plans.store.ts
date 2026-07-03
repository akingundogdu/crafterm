import { Store } from '@geajs/core'
import type { DirEntry } from '@services/fs/fs.types'

// Reactive state for the plans picker. `plans` (the async-loaded list, seeded once
// per open), `search` and `selected` are all read directly in the list view's
// template(), so gea re-renders it on every keystroke, arrow move or hover — the
// board pattern. A bare rev counter read via `void store.rev` is NOT tracked by the
// gea compiler, so the list must be a real reactive field the template actually
// reads (the ssh.store lesson). The plans list is static for the picker's lifetime,
// so `load()` reassigns it once and resets the search + selection for the new open.
class PlansStore extends Store {
  plans: DirEntry[] = []
  search = ''
  selected = 0

  load(plans: DirEntry[]): void {
    this.plans = [...plans]
    this.search = ''
    this.selected = 0
  }

  setSearch(search: string): void {
    this.search = search
  }

  setSelected(selected: number): void {
    this.selected = selected
  }
}

export default new PlansStore()
