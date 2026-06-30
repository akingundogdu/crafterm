import { createOverlay } from '@views/components/overlay/overlay'
import { panes } from '@views/state/spine'
import store from './track-modal.store'
import TrackModal from './track-modal'

// Opens the gea track modal for a pane: a @views overlay backdrop + the gea
// TrackModal body. Bails when the pane is gone. Self-contained — no @ui (§2.7).
export function openTrackModal(paneId: string): void {
  const pane = panes.get(paneId)
  if (!pane) return
  const ov = createOverlay({ closeOnBackdrop: true })
  store.open(pane, () => ov.close())
  new TrackModal().render(ov.overlay)
  ov.mount()
}
