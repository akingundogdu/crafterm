import './overlay.css'

// Overlay primitive. The single source of truth for the `.modal-overlay` backdrop
// in `src/views`, owning the idempotent close lifecycle + backdrop-click close.
// Callers append content into `overlay`, `mount()` to attach to <body>, and
// register `onClose`; a gea modal body mounts inside via
// `new X().render(handle.overlay)`. The backdrop node is created synchronously
// (document.createElement in this .tsx) because consumers — and happy-dom unit
// tests — read/append to it in the same tick, which gea's deferred render cannot
// guarantee.
export interface OverlayOptions {
  closeOnBackdrop?: boolean
}

export interface OverlayHandle {
  overlay: HTMLDivElement
  mount: () => void
  close: () => void
  onClose: (cb: () => void) => void
}

export function createOverlay(opts: OverlayOptions = {}): OverlayHandle {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'

  let done = false
  const cbs: Array<() => void> = []
  const close = (): void => {
    if (done) return
    done = true
    overlay.remove()
    for (const cb of cbs) cb()
  }

  if (opts.closeOnBackdrop !== false) {
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) close()
    })
  }

  return {
    overlay,
    mount: () => document.body.appendChild(overlay),
    close,
    onClose: (cb) => cbs.push(cb)
  }
}
