import type { OverlayOptions, OverlayHandle } from './overlay.types'

// Wires an overlay backdrop node: idempotent close (fires registered callbacks),
// backdrop-click close, and mount-to-body. Returns the overlay handle.
export function createOverlayController(
  overlay: HTMLDivElement,
  opts: OverlayOptions
): OverlayHandle {
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
