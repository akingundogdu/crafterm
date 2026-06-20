import type { Pane } from '@ui/types/types'
import { updatePaneStatus } from '@ui/pane/pane'

// Stop automatic tracking for the pane and close the modal.
export function makeStopTracking(pane: Pane, close: () => void): () => void {
  return () => {
    pane.trackProjectPath = null
    pane.trackFeatureId = null
    updatePaneStatus(pane)
    close()
  }
}

// Bind the pane to the currently selected project/feature, then close.
export function makeTrack(
  pane: Pane,
  getProject: () => string,
  getFeature: () => string,
  close: () => void
): () => void {
  return () => {
    const projectPath = getProject()
    if (!projectPath) return
    pane.trackProjectPath = projectPath
    pane.trackFeatureId = getFeature() || null
    updatePaneStatus(pane)
    close()
  }
}
