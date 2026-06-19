// Modal primitive: `.modal-overlay > .modal.modal-prompt[ <extra>]` with an h2
// title and a `.modal-actions` row (Cancel + primary confirm). Content is added
// with `append()`, which inserts BEFORE the actions row so DOM order stays
// `h2 → content → actions` — byte-identical to the app's existing modals.

import { createOverlay, type OverlayHandle } from '../overlay/overlay'
import { createButton } from '../button/button'
import './modal.css'

export interface ModalOptions {
  title: string
  className?: string // extra class on .modal (e.g. 'close-actions-modal')
  confirmText?: string // default 'OK'
  cancelText?: string // default 'Cancel'
  closeOnBackdrop?: boolean
}

export interface ModalHandle extends OverlayHandle {
  modal: HTMLDivElement
  actions: HTMLDivElement
  cancelBtn: HTMLButtonElement
  confirmBtn: HTMLButtonElement
  append: (...els: HTMLElement[]) => void
}

export function createModal(opts: ModalOptions): ModalHandle {
  const base = createOverlay({ closeOnBackdrop: opts.closeOnBackdrop })

  const cancelBtn = createButton({ text: opts.cancelText ?? 'Cancel' })
  const confirmBtn = createButton({ text: opts.confirmText ?? 'OK', variant: 'primary' })
  const actions = (
    <div class="modal-actions">
      {cancelBtn}
      {confirmBtn}
    </div>
  ) as HTMLDivElement

  const modal = (
    <div class={'modal modal-prompt' + (opts.className ? ' ' + opts.className : '')}>
      <h2>{opts.title}</h2>
      {actions}
    </div>
  ) as HTMLDivElement

  base.overlay.appendChild(modal)

  const append = (...els: HTMLElement[]): void => {
    for (const el of els) modal.insertBefore(el, actions)
  }

  return { ...base, modal, actions, cancelBtn, confirmBtn, append }
}
