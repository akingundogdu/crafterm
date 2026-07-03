import { Store } from '@geajs/core'
import type { SpotEntry } from './components/result-list'
import { BADGE_LABEL } from './spotlight.state'

// Reactive state for the unified spotlight. Every field the view renders — the
// active tab, the entries loaded for that tab, the search query, the selection
// index, and the loading flag — is a real reactive Store field the template READS
// AND USES, so gea patches the DOM on every keystroke / tab switch / arrow-key move
// (the command-palette pattern). A bare `rev` counter read via `void store.rev` is
// NOT tracked by the gea compiler, so each mutation reassigns one of these fields.
class SpotlightStore extends Store {
  activeTab = 'all'
  current: SpotEntry[] = []
  query = ''
  sel = 0
  loading = false

  setActiveTab(tab: string): void {
    this.activeTab = tab
  }

  setCurrent(entries: SpotEntry[]): void {
    this.current = entries
    this.loading = false
    this.sel = 0
  }

  setQuery(query: string): void {
    this.query = query
    this.sel = 0
  }

  setSel(sel: number): void {
    this.sel = sel
  }

  setLoading(): void {
    this.current = []
    this.loading = true
    this.sel = 0
  }
}

export const spotlightStore = new SpotlightStore()

// Filter the loaded tab entries by the search query, matching label + detail +
// badge label, capped at 200. Pure — the view derives the visible rows from it and
// the controller derives the keyboard-nav target from it, so both stay in sync.
export function filterSpotEntries(current: SpotEntry[], query: string): SpotEntry[] {
  const q = query.trim().toLowerCase()
  const items = q
    ? current.filter((e) =>
        `${e.label} ${e.detail ?? ''} ${BADGE_LABEL[e.source]}`.toLowerCase().includes(q)
      )
    : current
  return items.slice(0, 200)
}
