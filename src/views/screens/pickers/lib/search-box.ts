import './search-box.css'
import { el } from '@views/lib/dom'

// Shared "contains" search box for list modals (plain-DOM port of the @ui
// search-box). `onInput` re-renders the list. Sets `.spellcheck = false` as a
// property (not just an attribute) so it reflects. Self-contained (§2.7).
export function createSearchBox(placeholder: string, onInput: () => void): HTMLInputElement {
  const input = el('input', { class: 'search-box-input', type: 'text', placeholder, onInput })
  input.spellcheck = false
  return input
}
