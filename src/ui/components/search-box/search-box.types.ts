// Shared "contains" search box types.

export interface SearchBoxHandlers {
  onInput: () => void
  setup: (el: HTMLInputElement) => void
}
