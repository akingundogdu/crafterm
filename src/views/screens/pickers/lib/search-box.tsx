import './search-box.css'

// Shared "contains" search box for list modals (gea port of the @ui search-box).
// `onInput` re-renders the list. A `.tsx` factory returning the raw input node
// (§gea gotcha: a detached node consumed imperatively by the pickers can't come
// from a gea Component's deferred render + firstElementChild extraction, so it is
// built with document.createElement). Sets `.spellcheck = false` as a property
// (not just an attribute) so it reflects. Signature preserved so the
// searchInputWrapper / makeSearchInput consumers resolve unchanged.
export function createSearchBox(placeholder: string, onInput: () => void): HTMLInputElement {
  const input = document.createElement('input')
  input.className = 'search-box-input'
  input.type = 'text'
  input.placeholder = placeholder
  input.spellcheck = false
  input.addEventListener('input', onInput)
  return input
}
