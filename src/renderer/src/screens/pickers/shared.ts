import { makeCloseButton } from '../../dialog'

// Shared primitives for the picker family: a bare overlay+modal box with a close
// button, and the "contains" search input. Extracted from the pickers monolith so
// each per-picker module can consume them without pulling the whole file. (A later
// pass promotes these onto @crafterm/ui's modal/search-box, per HR-2.)

export function overlayModal(extraClass = ''): {
  overlay: HTMLElement
  modal: HTMLElement
  close: () => void
} {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal ' + extraClass
  overlay.appendChild(modal)
  const close = (): void => overlay.remove()
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  modal.appendChild(makeCloseButton(close))
  document.body.appendChild(overlay)
  return { overlay, modal, close }
}

// Last path segment (the directory/file name), tolerant of a trailing slash.
export function baseName(p: string): string {
  return p.replace(/\/+$/, '').split('/').pop() || p
}

// Shared "contains" search box for list modals. `onInput` re-renders the list.
export function makeSearchInput(placeholder: string, onInput: () => void): HTMLInputElement {
  const input = document.createElement('input')
  input.className = 'picker-input'
  input.type = 'text'
  input.placeholder = placeholder
  input.spellcheck = false
  input.addEventListener('input', onInput)
  return input
}
