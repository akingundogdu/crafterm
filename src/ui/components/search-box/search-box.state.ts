import type { SearchBoxHandlers } from './search-box.types'

// Builds the search box's DOM handlers. `setup` sets the spellcheck property
// (not just the attribute) so it reflects on `.spellcheck`.
export function makeSearchBoxHandlers(onInput: () => void): SearchBoxHandlers {
  return {
    onInput,
    setup: (el) => {
      el.spellcheck = false
    }
  }
}
