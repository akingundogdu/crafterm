import '@views/components/modal/modal.css'
import '@views/components/form-field/form-field.css'
import '@views/screens/reminders/components/remind-chips.css'
import { UITexts } from '@texts'
import type { Bookmark } from '@views/types/types'
import { createOverlay } from '@views/components/overlay/overlay'
import { el } from '@views/lib/dom'
import { snoozeOptions, snoozeReminder } from '@views/screens/reminders/reminders.engine'

// Quick "remind me about this bookmark" picker: one chip per snooze option, using
// the migrated gea reminders engine. A bare overlay (no Cancel/OK row) matches the
// original modal. Static content → plain DOM. Self-contained — no @ui (§2.7).
export function showRemindPicker(bm: Bookmark): void {
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
            snoozeReminder(`Bookmark: ${bm.title}`, opt.at, { kind: 'bookmark', bookmarkId: bm.id })
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
    el('div', { class: 'field-hint' }, bm.title),
    chips
  )

  ov.overlay.appendChild(modal)
  ov.mount()
}
