import { createButton } from '@ui/components'
import { UITexts } from '@texts'
import type { Pane } from '@ui/types/types'
import { makeStopTracking, makeTrack } from './track-modal.state'

interface TrackActionsDeps {
  pane: Pane
  getProject: () => string
  getFeature: () => string
  close: () => void
}

// The modal's action row: an optional Stop button (when already tracking) + Track.
export function createTrackActions({ pane, getProject, getFeature, close }: TrackActionsDeps): HTMLDivElement {
  const actions = (<div class="modal-actions" />) as HTMLDivElement
  if (pane.trackProjectPath) {
    actions.appendChild(
      createButton({
        text: UITexts.Time.trackModal.stopTracking,
        onClick: makeStopTracking(pane, close)
      })
    )
  }
  actions.appendChild(
    createButton({
      text: UITexts.Time.trackModal.track,
      variant: 'primary',
      onClick: makeTrack(pane, getProject, getFeature, close)
    })
  )
  return actions
}
