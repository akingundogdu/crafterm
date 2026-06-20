import type { ReminderPayload } from '@ui/types/types'
import { snoozeReminder } from '../reminders'

// Click handler for a snooze chip: schedules the reminder, then closes the modal.
export function makeSnoozeChipClick(
  reminderText: string,
  at: number,
  payload: ReminderPayload,
  close: () => void
): () => void {
  return () => {
    snoozeReminder(reminderText, at, payload)
    close()
  }
}
