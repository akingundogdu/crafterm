import './style.css'
import { loadSettings, applyBgColor } from './state'
import { showImproveModal } from './improve'
import { storeService } from './services/ipc'

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
