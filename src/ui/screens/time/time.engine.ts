import { settings } from '@ui/state/state'
import { state } from '@ui/state/state'
import { findProjectByPath } from '@ui/catalog/catalog'
import { appService, soundService } from '@services'
import { UITexts } from '@texts'
import type { ActiveTimer } from './time.types'
import { logInterval } from './time.state'
import { renderTimerDisplay } from './components/timer-display'
import { updateTimerToggle } from './components/timer-toggle'

// Dependencies the timer engine needs from the orchestrator: where to read the
// selected project/feature and how to refresh the summary after a state change.
interface TimerEngineDeps {
  getProjectPath: () => string
  getFeatureId: () => string | null
  renderSummary: () => void
}

// The running timer (null when stopped). Survives tab switches.
let active: ActiveTimer | null = null
let ticker: number | null = null
let deps: TimerEngineDeps

export function wireTimerEngine(d: TimerEngineDeps): void {
  deps = d
}

// Current running timer, read by the summary so it can show the live interval.
export function getActiveTimer(): ActiveTimer | null {
  return active
}

export function tickElapsed(): void {
  renderTimerDisplay(active)
}

// Single timer loop: finish a due pomodoro, otherwise refresh the display.
function onTick(): void {
  if (active?.pomodoroMs && Date.now() - active.start >= active.pomodoroMs) {
    finishPomodoro()
    return
  }
  tickElapsed()
  deps.renderSummary()
}

export function updateToggle(): void {
  updateTimerToggle(!!active)
}

// Log the active interval (if long enough) and clear the timer.
function stopActive(): void {
  if (active) {
    logInterval(active, active.pomodoroMs ? 'pomodoro' : 'manual')
  }
  active = null
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
}

// Manual Start/Stop button.
export function toggle(): void {
  if (active) {
    stopActive()
  } else {
    const projectPath = deps.getProjectPath()
    if (!projectPath) return
    active = { projectPath, featureId: deps.getFeatureId(), start: Date.now() }
    ticker = window.setInterval(onTick, 1000)
  }
  updateToggle()
  tickElapsed()
  deps.renderSummary()
}

// Start a countdown pomodoro for `ms`. `repeat` re-arms it after each finish.
export function startPomodoro(ms: number, repeat = false): void {
  if (active) return
  const projectPath = deps.getProjectPath()
  if (!projectPath) return
  active = {
    projectPath,
    featureId: deps.getFeatureId(),
    start: Date.now(),
    pomodoroMs: ms,
    repeat
  }
  ticker = window.setInterval(onTick, 1000)
  updateToggle()
  tickElapsed()
  deps.renderSummary()
}

// Pomodoro reached its end: log it, alert + sound, then re-arm if repeating.
function finishPomodoro(): void {
  const proj = active ? findProjectByPath(state.tree, active.projectPath) : null
  const ms = active?.pomodoroMs
  const repeat = active?.repeat
  const projectPath = active?.projectPath
  const featureId = active?.featureId ?? null
  stopActive()
  appService.notify(UITexts.Time.pomodoroDoneTitle, UITexts.Time.pomodoroBody(proj?.name ?? UITexts.Time.sessionFallback))
  if (settings.notifSound) soundService.play(settings.notifSound)
  // Re-arm the same countdown for repeating pomodoros (no project select needed).
  if (repeat && ms && projectPath) {
    active = { projectPath, featureId, start: Date.now(), pomodoroMs: ms, repeat: true }
    ticker = window.setInterval(onTick, 1000)
  }
  updateToggle()
  tickElapsed()
  deps.renderSummary()
}
