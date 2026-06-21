import './time.css'
import { renderProjects, projectSel } from './components/project-selector'
import { featureSel } from './components/feature-selector'
import { renderSummary as renderSummaryView } from './components/time-summary'
import {
  wireTimerEngine,
  getActiveTimer,
  tickElapsed,
  updateToggle
} from './time.engine'
import {
  wireAutoTracking,
  getAutoSession,
  startAutoTracker
} from './auto-tracking.engine'
import { initTime } from './time-events.engine'

// Re-exported for main.ts, which still imports openTrackModal from the time module.
export { openTrackModal } from './components/track-modal'
export { startAutoTracker, initTime }

// Bridge the two engines' live state into the shared summary render.
function renderSummary(): void {
  renderSummaryView({ getActive: getActiveTimer, getAutoSession })
}

// Thread the selectors + summary refresh into the timer/auto engines (once).
wireTimerEngine({
  getProjectPath: () => projectSel().value,
  getFeatureId: () => featureSel().value || null,
  renderSummary
})
wireAutoTracking({ renderSummary })

export function renderTime(): void {
  renderProjects()
  updateToggle()
  tickElapsed()
  renderSummary()
}
