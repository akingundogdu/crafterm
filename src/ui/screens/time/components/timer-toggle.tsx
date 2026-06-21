import { UITexts } from '@texts'
import { projectSel } from './project-selector'
import { featureSel } from './feature-selector'

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

// Sync the Start/Stop button label + disabled states to whether a timer runs.
export function updateTimerToggle(running: boolean): void {
  const btn = el<HTMLButtonElement>('time-toggle')
  btn.textContent = running ? UITexts.Time.stop : UITexts.Time.start
  btn.classList.toggle('running', running)
  projectSel().disabled = running
  featureSel().disabled = running
  document
    .querySelectorAll<HTMLButtonElement>('.time-pom-preset')
    .forEach((b) => (b.disabled = running))
}
