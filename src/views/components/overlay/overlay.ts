import './overlay.css'

// Overlay primitive (gea tree, §2.7 self-contained). The single source of truth
// for constructing the `.modal-overlay` backdrop in `src/views` — mirrors the
// legacy @ui createOverlay (a transient body-mounted backdrop is static, so it is
// plain DOM, not a gea Component). Owns the idempotent close lifecycle and
// backdrop-click close. Callers append content into `overlay`, `mount()` to
// attach to <body>, and register `onClose`. A gea modal body mounts inside via
// `new X().render(handle.overlay)`.
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
