import { createOverlay, createButton } from '@ui/components'
import { makeCloseButton } from '../../../dialog'
import type { ReminderPayload } from '../../../types'
import { snoozeOptions, snoozeReminder } from '../reminders'

// Shared "Remind me about this" modal used by bookmarks, notebook items, and any
// other place that wants to attach a reminder with a payload. Renders the same
// snooze-chip grid as the right-panel cards.
export function showRemindModal(
  subject: string,
  reminderText: string,
  payload: ReminderPayload
): void {
  const ov = createOverlay({ closeOnBackdrop: true })

  const chips = (<div class="bookmarks-remind-chips" />) as HTMLDivElement
  for (const opt of snoozeOptions()) {
    chips.appendChild(
      createButton({
        text: opt.label,
        className: 'bookmarks-remind-chip',
        onClick: () => {
          snoozeReminder(reminderText, opt.at, payload)
          ov.close()
        }
      })
    )
  }

  const modal = (
    <div class="modal modal-prompt">
      {makeCloseButton(ov.close)}
      <h2>Remind me about this</h2>
      <div class="field-hint">{subject}</div>
      {chips}
    </div>
  ) as HTMLDivElement

  ov.overlay.appendChild(modal)
  ov.mount()
}
