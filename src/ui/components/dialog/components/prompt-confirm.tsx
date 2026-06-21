import { createModal } from '@ui/components'
import type { PromptConfirmOptions } from '../dialog.types'
import { makeKeyHandler } from '../dialog.state'

// Yes/no confirmation modal. Resolves true if confirmed.
export function promptConfirm(opts: PromptConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const msg = (<div class="modal-confirm-message">{opts.message}</div>) as HTMLDivElement
    const m = createModal({ title: opts.title, confirmText: opts.confirmText })
    m.append(msg)
    m.mount()

    let done = false
    const close = (v: boolean): void => {
      if (done) return
      done = true
      m.close()
      resolve(v)
    }
    m.onClose(() => close(false))
    m.confirmBtn.addEventListener('click', () => close(true))
    m.cancelBtn.addEventListener('click', () => close(false))
    m.modal.tabIndex = -1
    m.modal.addEventListener('keydown', makeKeyHandler(() => close(true), () => close(false)))
    m.confirmBtn.focus()
  })
}
