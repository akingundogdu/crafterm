// Overlay primitive: a full-screen `.modal-overlay` backdrop. Owns the close
// lifecycle (idempotent) and backdrop-click close. The caller appends content
// into `overlay`, calls `mount()` to attach to <body>, and registers `onClose`.

import './overlay.css'

export interface OverlayHandle {
  overlay: HTMLDivElement
  mount: () => void
  close: () => void
  onClose: (cb: () => void) => void
}

export function createOverlay(opts: { closeOnBackdrop?: boolean } = {}): OverlayHandle {
  const overlay = (<div class="modal-overlay" />) as HTMLDivElement
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
