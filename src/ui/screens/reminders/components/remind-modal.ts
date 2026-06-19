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
  const modal = document.createElement('div')
  modal.className = 'modal modal-prompt'
  ov.overlay.appendChild(modal)
  modal.appendChild(makeCloseButton(ov.close))
  const h = document.createElement('h2')
  h.textContent = 'Remind me about this'
  modal.appendChild(h)
  const sub = document.createElement('div')
  sub.className = 'field-hint'
  sub.textContent = subject
  modal.appendChild(sub)
  const chips = document.createElement('div')
  chips.className = 'bookmarks-remind-chips'
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
  modal.appendChild(chips)
  ov.mount()
}
