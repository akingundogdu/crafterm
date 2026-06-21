import { state, panes } from '@ui/state/state'
import type { AutoSession } from './time.types'
import { logInterval, shouldTrackPane } from './time.state'

// Dependency the auto-tracking engine needs: how to refresh the summary after a
// state change so the live auto-session interval stays in sync.
interface AutoTrackingDeps {
  renderSummary: () => void
}

// Automatic (terminal-bound) tracking session (null when idle).
let autoSession: AutoSession | null = null
let lastUserActivity = Date.now()
let deps: AutoTrackingDeps

export function wireAutoTracking(d: AutoTrackingDeps): void {
  deps = d
}

// Current auto session, read by the summary so it can show the live interval.
export function getAutoSession(): AutoSession | null {
  return autoSession
}

function closeAutoSession(): void {
  if (!autoSession) return
  logInterval(autoSession, 'auto')
  autoSession = null
}

function autoTick(): void {
  const id = state.activePaneId
  const pane = id ? panes.get(id) : null
  if (shouldTrackPane(pane, lastUserActivity) && pane && id) {
    if (!autoSession || autoSession.paneId !== id) {
      closeAutoSession()
      autoSession = {
        paneId: id,
        projectPath: pane.trackProjectPath!,
        featureId: pane.trackFeatureId ?? null,
        start: Date.now()
      }
    }
  } else {
    closeAutoSession()
  }
  deps.renderSummary()
}

export function startAutoTracker(): void {
  document.addEventListener('mousemove', () => (lastUserActivity = Date.now()), true)
  document.addEventListener('keydown', () => (lastUserActivity = Date.now()), true)
  window.setInterval(autoTick, 30_000)
}
