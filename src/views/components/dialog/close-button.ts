import { el } from '@views/lib/dom'

// A reusable "×" close button pinned to a modal's top-right corner (plain-DOM
// port of @ui dialog makeCloseButton). Pass the modal's close handler; the caller
// appends it to the `.modal` element. Self-contained — no @ui (§2.7).
export function makeCloseButton(onClose: () => void): HTMLButtonElement {
  return el(
    'button',
    { class: 'modal-close', type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', onClick: onClose },
    '×'
  )
}
