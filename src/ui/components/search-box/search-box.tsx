import './search-box.css'
import { makeSearchBoxHandlers } from './search-box.state'

// Shared "contains" search box for list modals. `onInput` re-renders the list.
// Faithful to the app's existing markup (relocated from pickers.makeSearchInput);
// a debounce/clear-button enhancement can come later.
export function createSearchBox(placeholder: string, onInput: () => void): HTMLInputElement {
  const h = makeSearchBoxHandlers(onInput)
  return (
    <input
      class="search-box-input"
      type="text"
      placeholder={placeholder}
      onInput={h.onInput}
      ref={h.setup}
    />
  ) as HTMLInputElement
}
