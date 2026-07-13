// A running manual/pomodoro timer (null when stopped). Survives tab switches.
// `pomodoroMs` set ⇒ it's a countdown that auto-finishes (alarm + log); `repeat`
// re-arms it after each finish.
export interface ActiveTimer {
  projectPath: string
  featureId: string | null
  start: number
  pomodoroMs?: number
  repeat?: boolean
}

// Automatic (terminal-bound) tracking session: counts while a tracked terminal is
// the active pane, the window is focused, and there's recent activity.
export interface AutoSession {
  paneId: string
  projectPath: string
  featureId: string | null
  start: number
}
