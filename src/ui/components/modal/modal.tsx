import { createOverlay } from '../overlay/overlay'
import './modal.css'
import type { ModalOptions, ModalHandle } from './modal.types'
import { resolveModalProps, makeModalAppend } from './modal.state'
import { createModalBase } from './components/modal-base'
import { createModalActions } from './components/modal-actions'

export type { ModalOptions, ModalHandle } from './modal.types'

// Modal primitive: `.modal-overlay > .modal.modal-prompt[ <extra>]` with an h2
// title and a `.modal-actions` row (Cancel + primary confirm). Content is added
// with `append()`, which inserts BEFORE the actions row so DOM order stays
// `h2 → content → actions` — byte-identical to the app's existing modals.
export function createModal(opts: ModalOptions): ModalHandle {
  const p = resolveModalProps(opts)
  const base = createOverlay({ closeOnBackdrop: opts.closeOnBackdrop })

  const { actions, cancelBtn, confirmBtn } = createModalActions(p.cancelText, p.confirmText)
  const modal = createModalBase(p.modalClass, opts.title, actions)

  base.overlay.appendChild(modal)

  return { ...base, modal, actions, cancelBtn, confirmBtn, append: makeModalAppend(modal, actions) }
}
