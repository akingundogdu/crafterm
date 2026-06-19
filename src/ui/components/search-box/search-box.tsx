// Shared "contains" search box for list modals. `onInput` re-renders the list.
// Faithful to the app's existing markup (relocated from pickers.makeSearchInput);
// a debounce/clear-button enhancement can come later.

import './search-box.css'

export function createSearchBox(placeholder: string, onInput: () => void): HTMLInputElement {
  return (
    <input
      class="search-box-input"
      type="text"
      placeholder={placeholder}
      onInput={onInput}
      ref={(el: HTMLInputElement) => {
        // Set the property (not just the attribute) so it reflects on `.spellcheck`.
        el.spellcheck = false
      }}
    />
  ) as HTMLInputElement
}
