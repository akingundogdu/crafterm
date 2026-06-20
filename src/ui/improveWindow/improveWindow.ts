import '@ui/styles/tokens.css'
import '@ui/components/modal/modal.css'
import '@ui/styles/global.css'
import { bootstrapImproveWindow } from './improveWindow.state'

// A standalone window that hosts only the Improve Crafterm panel — meant to stay
// open on a second monitor. State/settings are loaded so themes + the todo file
// path resolve exactly like the main window; the panel reads/writes the same
// todo-list.json, so edits stay in sync (re-opened on focus).
void bootstrapImproveWindow()
