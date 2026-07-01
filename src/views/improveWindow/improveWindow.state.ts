import { applyBgColor } from '@views/state/state'
import { loadSettings } from '@repositories/settings.service'
import { showImproveModal } from '../screens/improve-crafterm/improve-crafterm.state'
import { storeService } from '@services'

// Loads persisted state/settings so themes + the todo file path resolve exactly
// like the main window, then opens the Improve Crafterm panel in standalone-window
// mode (it reads/writes the same todo-list.json, so edits stay in sync).
export async function bootstrapImproveWindow(): Promise<void> {
  const saved = await storeService.load()
  if (saved) loadSettings(saved)
  applyBgColor()
  await showImproveModal({ windowMode: true })
}
