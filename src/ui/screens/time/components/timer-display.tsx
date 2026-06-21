import { fmtClock } from '@services/domain/time'
import type { ActiveTimer } from '../time.types'

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

// Paint the elapsed/remaining clock for the given running timer (or zero when idle).
export function renderTimerDisplay(active: ActiveTimer | null): void {
  if (!active) {
    el('time-elapsed').textContent = '00:00:00'
    return
  }
  const elapsed = Date.now() - active.start
  // pomodoro shows remaining (countdown); manual shows elapsed (count up)
  el('time-elapsed').textContent = active.pomodoroMs
    ? fmtClock(Math.max(0, active.pomodoroMs - elapsed))
    : fmtClock(elapsed)
}
