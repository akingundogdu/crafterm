import type { ReminderPayload } from '@ui/types/types'
import { addSnooze, runTick } from './reminders.state'
import Reminders from '@views/screens/reminders/reminders'

// Reminders panel — migrated to gea (src/views/screens/reminders). This legacy
// entry mounts the gea component into #reminder-list; the snooze helper, the
// fire-timer (runTick) and the form/modal openers stay here and refresh the gea
// list by re-mounting via renderReminders.

// Re-exported for the many callers (main, spotlight, meetingNotes, notebook,
// dailyPlan, bookmarks, notifications).
export { openReminderForm } from './components/reminder-form'
export { showRemindModal } from './components/remind-modal'
export { snoozeOptions } from './reminders.state'
export type { SnoozeOption } from './reminders.types'

export function renderReminders(): void {
  const el = document.getElementById('reminder-list')!
  el.replaceChildren()
  new Reminders().render(el)
}

// Re-arm a reminder (or create one) from a snooze action on its notification card.
export function snoozeReminder(text: string, at: number, payload?: ReminderPayload): void {
  addSnooze(text, at, payload)
  renderReminders()
}

function tick(): void {
  runTick(renderReminders)
}

export function startReminderTimer(): void {
  window.setInterval(tick, 20_000) // check every 20s
  tick() // catch anything already due on launch
}
