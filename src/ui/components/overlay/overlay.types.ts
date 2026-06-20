// Overlay primitive types.

export interface OverlayOptions {
  closeOnBackdrop?: boolean
}

export interface OverlayHandle {
  overlay: HTMLDivElement
  mount: () => void
  close: () => void
  onClose: (cb: () => void) => void
}
