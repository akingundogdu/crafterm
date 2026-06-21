import { createOverlay } from '@ui/components'
import type { ReminderPayload } from '@ui/types/types'
import { createSnoozeChips } from './snooze-chips'
import { createRemindModalShell } from './remind-modal-shell'

// Shared "Remind me about this" modal used by bookmarks, notebook items, and any
// other place that wants to attach a reminder with a payload. Renders the same
// snooze-chip grid as the right-panel cards.
export function showRemindModal(
  subject: string,
  reminderText: string,
  payload: ReminderPayload
): void {
  const ov = createOverlay({ closeOnBackdrop: true })

  const chips = createSnoozeChips(reminderText, payload, ov.close)
  const modal = createRemindModalShell(subject, chips, ov.close)

  ov.overlay.appendChild(modal)
  ov.mount()
}
