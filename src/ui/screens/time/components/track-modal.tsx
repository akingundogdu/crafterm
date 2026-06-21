import { createOverlay } from '@ui/components'
import { panes } from '@ui/state/state'
import { buildTrackModalForm } from './track-modal-form'

// Bind a terminal to a project/feature for automatic time tracking.
export function openTrackModal(paneId: string): void {
  const pane = panes.get(paneId)
  if (!pane) return
  const ov = createOverlay({ closeOnBackdrop: true })
  ov.overlay.appendChild(buildTrackModalForm(pane, ov.close))
  ov.mount()
}
