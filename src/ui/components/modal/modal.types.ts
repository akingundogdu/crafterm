import type { OverlayHandle } from '../overlay/overlay.types'

// Modal primitive types.

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

// Defaults + class string resolved from ModalOptions and bound by the view.
export interface ModalViewProps {
  confirmText: string
  cancelText: string
  modalClass: string
}
