import { makeCloseButton } from '@ui/components/dialog/dialog'
import { UITexts } from '@texts'
import type { Pane } from '@ui/types/types'
import { createTrackProjectSelect } from './track-project-select'
import { createTrackFeatureSelect } from './track-feature-select'
import { createTrackActions } from './track-actions'

// Build the track modal's body: project/feature selects (feature rebuilt on
// project change) and the action row, all bound to `pane`.
export function buildTrackModalForm(pane: Pane, close: () => void): HTMLDivElement {
  const proj = createTrackProjectSelect(pane)

  let feat = createTrackFeatureSelect(pane, proj.value)
  proj.addEventListener('change', () => {
    const next = createTrackFeatureSelect(pane, proj.value)
    feat.replaceWith(next)
    feat = next
  })

  const actions = createTrackActions({
    pane,
    getProject: () => proj.value,
    getFeature: () => feat.value,
    close
  })

  return (
    <div class="modal track-modal">
      {makeCloseButton(close)}
      <h2>{UITexts.Time.trackModal.title}</h2>
      <div class="reminder-label">{UITexts.Time.trackModal.project}</div>
      {proj}
      <div class="reminder-label">{UITexts.Time.trackModal.feature}</div>
      {feat}
      {actions}
    </div>
  ) as HTMLDivElement
}
