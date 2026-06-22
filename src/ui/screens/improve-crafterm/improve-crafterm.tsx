import './improve-crafterm.css'
import { ImproveModalController } from './improve-crafterm.controller'

// ---- Improve Crafterm panel -----------------------------------------
// Thin wrapper over ImproveModalController, which builds the modal and owns
// all per-panel state and behavior.
export function showImproveModal(opts: { windowMode?: boolean } = {}): Promise<void> {
  return new ImproveModalController(opts).run()
}
