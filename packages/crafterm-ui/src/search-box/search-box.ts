// Shared "contains" search box for list modals. `onInput` re-renders the list.
// Faithful to the app's existing `.picker-input` markup (relocated from
// pickers.makeSearchInput); a debounce/clear-button enhancement can come later.

export function createSearchBox(placeholder: string, onInput: () => void): HTMLInputElement {
  const input = document.createElement('input')
  input.className = 'picker-input'
  input.type = 'text'
  input.placeholder = placeholder
  input.spellcheck = false
  input.addEventListener('input', onInput)
  return input
}
