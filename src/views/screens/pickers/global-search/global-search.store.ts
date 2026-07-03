import { Store } from '@geajs/core'

// Reactive state for the Spotlight global-search picker. `query` (the search box
// text) and `sel` (the keyboard-navigation selection index) are the source of
// truth, read directly in the list view's template() so gea patches the list on
// every keystroke / arrow move / hover — the board pattern. The async-built entry
// index is static after open and handed to the list via props, not stored here.
// `rev` is bumped for refreshes the view didn't drive itself.
class GlobalSearchStore extends Store {
  query = ''
  sel = 0
  rev = 0

  reset(): void {
    this.query = ''
    this.sel = 0
  }

  setQuery(query: string): void {
    this.query = query
  }

  setSel(sel: number): void {
    this.sel = sel
  }

  bump(): void {
    this.rev++
  }
}

export default new GlobalSearchStore()
