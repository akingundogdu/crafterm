import { createOverlay } from '../overlay/overlay'
import { createButton } from '../button/button'
import './modal.css'
import type { ModalOptions, ModalHandle } from './modal.types'
import { resolveModalProps, makeModalAppend } from './modal.state'

export type { ModalOptions, ModalHandle } from './modal.types'

// Modal primitive: `.modal-overlay > .modal.modal-prompt[ <extra>]` with an h2
// title and a `.modal-actions` row (Cancel + primary confirm). Content is added
// with `append()`, which inserts BEFORE the actions row so DOM order stays
// `h2 → content → actions` — byte-identical to the app's existing modals.
export function createModal(opts: ModalOptions): ModalHandle {
  const p = resolveModalProps(opts)
  const base = createOverlay({ closeOnBackdrop: opts.closeOnBackdrop })

  const cancelBtn = createButton({ text: p.cancelText })
  const confirmBtn = createButton({ text: p.confirmText, variant: 'primary' })
  const actions = (
    <div class="modal-actions">
      {cancelBtn}
      {confirmBtn}
    </div>
  ) as HTMLDivElement

  const modal = (
    <div class={p.modalClass}>
      <h2>{opts.title}</h2>
      {actions}
    </div>
  ) as HTMLDivElement

  base.overlay.appendChild(modal)

  return { ...base, modal, actions, cancelBtn, confirmBtn, append: makeModalAppend(modal, actions) }
}
