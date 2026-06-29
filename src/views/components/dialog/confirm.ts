import { createOverlay } from '../overlay/overlay'
import '../modal/modal.css'

// Self-contained (§2.7) yes/no confirmation modal. Resolves true if confirmed,
// false on cancel / backdrop / Escape. Static content, so it builds plain DOM
// directly (no gea reactivity needed) — byte-faithful to the legacy
// promptConfirm: `.modal-overlay > .modal.modal-prompt` with `h2 → message →
// actions(Cancel + primary confirm)`, modal-scoped Enter=confirm / Escape=cancel,
// and the confirm button focused. The backdrop is built by the @views overlay
// primitive (the single allowed overlay constructor in src/views).
export interface PromptConfirmOptions {
  title: string
  message: string
  confirmText?: string
}

export function promptConfirm(opts: PromptConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const ov = createOverlay()

    const modal = document.createElement('div')
    modal.className = 'modal modal-prompt'
    modal.tabIndex = -1

    const h2 = document.createElement('h2')
    h2.textContent = opts.title

    const message = document.createElement('div')
    message.className = 'modal-confirm-message'
    message.textContent = opts.message

    const actions = document.createElement('div')
    actions.className = 'modal-actions'
    const cancelBtn = document.createElement('button')
    cancelBtn.textContent = 'Cancel'
    const confirmBtn = document.createElement('button')
    confirmBtn.className = 'button-primary'
    confirmBtn.textContent = opts.confirmText ?? 'OK'
    actions.append(cancelBtn, confirmBtn)

    modal.append(h2, message, actions)
    ov.overlay.appendChild(modal)

    let done = false
    const close = (value: boolean): void => {
      if (done) return
      done = true
      ov.close()
      resolve(value)
    }

    ov.onClose(() => close(false))
    cancelBtn.addEventListener('click', () => close(false))
    confirmBtn.addEventListener('click', () => close(true))
    modal.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') close(true)
      else if (e.key === 'Escape') close(false)
    })

    ov.mount()
    confirmBtn.focus()
  })
}
