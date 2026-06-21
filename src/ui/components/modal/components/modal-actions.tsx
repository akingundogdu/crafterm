import { createButton } from '../../button/button'

// Modal actions row: `.modal-actions` with a Cancel button + a primary confirm
// button. Returns the row plus the two buttons for the caller to wire.
export function createModalActions(
  cancelText: string,
  confirmText: string
): { actions: HTMLDivElement; cancelBtn: HTMLButtonElement; confirmBtn: HTMLButtonElement } {
  const cancelBtn = createButton({ text: cancelText })
  const confirmBtn = createButton({ text: confirmText, variant: 'primary' })
  const actions = (
    <div class="modal-actions">
      {cancelBtn}
      {confirmBtn}
    </div>
  ) as HTMLDivElement
  return { actions, cancelBtn, confirmBtn }
}
