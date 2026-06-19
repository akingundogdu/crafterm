import '@ui/styles/tokens.css'
import '@ui/components/modal/modal.css'
import './global.css'
import { applyBgColor } from './state'
import { loadSettings } from '@services/storage/settings.service'
import { showImproveModal } from './screens/improve-crafterm/improve-crafterm'
import { storeService } from '@services'

// A standalone window that hosts only the Improve Crafterm panel — meant to stay
// open on a second monitor. State/settings are loaded so themes + the todo file
// path resolve exactly like the main window; the panel reads/writes the same
// todo-list.json, so edits stay in sync (re-opened on focus).
async function main(): Promise<void> {
  const saved = await storeService.load()
  if (saved) loadSettings(saved)
  applyBgColor()
  await showImproveModal({ windowMode: true })
}

void main()
