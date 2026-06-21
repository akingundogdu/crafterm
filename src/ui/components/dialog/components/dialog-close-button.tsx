import { createButton } from '@ui/components'

// A reusable "×" close button pinned to a modal's top-right corner.
// Pass the modal's close handler; the caller appends it to the `.modal` element.
export function makeCloseButton(onClose: () => void): HTMLButtonElement {
  return createButton({
    text: '×',
    className: 'modal-close',
    type: 'button',
    ariaLabel: 'Close',
    title: 'Close (Esc)',
    onClick: onClose
  })
}
