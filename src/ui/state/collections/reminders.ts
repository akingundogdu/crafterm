import type { Reminder } from '@ui/types/types'

// Reminders collection — extracted from `settings` (was settings.reminders).
// Persisted into the single crafterm-state.json; reminderRepo operates here.
export const reminders: Reminder[] = []

export function setReminders(next: Reminder[]): void {
  reminders.length = 0
  reminders.push(...next)
}
