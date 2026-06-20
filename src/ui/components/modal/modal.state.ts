import type { ModalOptions, ModalViewProps } from './modal.types'

// Resolves ModalOptions defaults + the `.modal` class string for the view.
export function resolveModalProps(opts: ModalOptions): ModalViewProps {
  return {
    confirmText: opts.confirmText ?? 'OK',
    cancelText: opts.cancelText ?? 'Cancel',
    modalClass: 'modal modal-prompt' + (opts.className ? ' ' + opts.className : '')
  }
}

// Builds `append`, which inserts content BEFORE the actions row so DOM order stays
// `h2 → content → actions`.
export function makeModalAppend(
  modal: HTMLDivElement,
  actions: HTMLDivElement
): (...els: HTMLElement[]) => void {
  return (...els) => {
    for (const el of els) modal.insertBefore(el, actions)
  }
}
