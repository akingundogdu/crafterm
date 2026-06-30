import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'

// Category order for the settings nav (left list). The literal English values
// double as the panel-lookup keys in the view.
export const SETTINGS_CATEGORIES = [
  UITexts.Settings.tabs.appearance,
  UITexts.Settings.tabs.theme,
  UITexts.Settings.tabs.sidebar,
  UITexts.Settings.tabs.tabs,
  UITexts.Settings.tabs.workspace,
  UITexts.Settings.tabs.projects,
  UITexts.Settings.tabs.commands,
  UITexts.Settings.tabs.reminders,
  UITexts.Settings.tabs.actionMenu,
  UITexts.Settings.tabs.shortcuts,
  UITexts.Settings.tabs.systemUpdate
] as const

function formatTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => (n < 10 ? '0' + n : String(n))
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// Builds the footer save-chip refresher: reflects pending / last-saved / idle.
export function makeRefreshChip(chip: HTMLSpanElement): () => void {
  return () => {
    if (persistence.status.pending) {
      chip.textContent = UITexts.Settings.save.saving
      chip.dataset.state = 'pending'
    } else if (persistence.status.lastSavedAt) {
      chip.textContent = UITexts.Settings.save.saved(formatTime(persistence.status.lastSavedAt))
      chip.dataset.state = 'saved'
    } else {
      chip.textContent = UITexts.Settings.save.noChanges
      chip.dataset.state = 'idle'
    }
  }
}

export function flushSave(): void {
  persistence.flush()
}
