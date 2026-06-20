import './overlay.css'
import type { OverlayOptions, OverlayHandle } from './overlay.types'
import { createOverlayController } from './overlay.state'

export type { OverlayOptions, OverlayHandle } from './overlay.types'

// Overlay primitive: a full-screen `.modal-overlay` backdrop. Owns the close
// lifecycle (idempotent) and backdrop-click close. The caller appends content
// into `overlay`, calls `mount()` to attach to <body>, and registers `onClose`.
export function createOverlay(opts: OverlayOptions = {}): OverlayHandle {
  const overlay = (<div class="modal-overlay" />) as HTMLDivElement
  return createOverlayController(overlay, opts)
}
