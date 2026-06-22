import './pr.css'
import { prController } from './pr.controller'

// The right-panel "Pull Requests / Deployments" tab. Polls GitHub (via gh) while
// visible and surfaces CI/deploy completion as notifications. Cards, badges, the
// repo picker, the text modal, and change-alert tracking live in sibling modules;
// the PrController orchestrates rendering, scoping, merging, and the adaptive poll.
export function renderPr(): Promise<void> {
  return prController.renderPr()
}

export function prTabVisible(visible: boolean): void {
  prController.prTabVisible(visible)
}
