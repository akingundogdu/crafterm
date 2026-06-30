import '@views/components/modal/modal.css'
import '@views/components/form-field/form-field.css'
import './remind-chips.css'
import { UITexts } from '@texts'
import type { ReminderPayload } from '@views/types/types'
import { createOverlay } from '@views/components/overlay/overlay'
import { el } from '@views/lib/dom'
import { snoozeOptions, snoozeReminder } from '../reminders.engine'

// Shared "Remind me about this" modal used by daily-plan tasks, meeting notes, and
// any place that attaches a reminder with a payload. Renders the same snooze-chip
// grid as the right-panel cards. Static content, so it's plain DOM (no gea
// reactivity needed) — mirrors the legacy showRemindModal. Self-contained (§2.7).
export function showRemindModal(subject: string, reminderText: string, payload: ReminderPayload): void {
  const ov = createOverlay({ closeOnBackdrop: true })

  const chips = el(
    'div',
    { class: 'bookmarks-remind-chips' },
    ...snoozeOptions().map((opt) =>
      el(
        'button',
        {
          class: 'bookmarks-remind-chip',
          onClick: () => {
            snoozeReminder(reminderText, opt.at, payload)
            ov.close()
          }
        },
        opt.label
      )
    )
  )

  const modal = el(
    'div',
    { class: 'modal modal-prompt' },
    el(
      'button',
      { class: 'modal-close', type: 'button', 'aria-label': 'Close', title: 'Close', onClick: ov.close },
      '×'
    ),
    el('h2', null, UITexts.Reminders.remindModalTitle),
    el('div', { class: 'field-hint' }, subject),
    chips
  )

  ov.overlay.appendChild(modal)
  ov.mount()
}
