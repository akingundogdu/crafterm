import { toggle } from './time.engine'
import { projectSel } from './components/project-selector'
import { renderFeatures } from './components/feature-selector'
import { initPomodoroControls } from './components/pomodoro-controls'
import { showReport } from './components/time-report'

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

// Wire all of the Time panel's DOM listeners (called once at startup).
export function initTime(): void {
  projectSel().addEventListener('change', renderFeatures)
  el('time-toggle').addEventListener('click', toggle)
  initPomodoroControls()
  el('time-report-btn').addEventListener('click', showReport)
}
