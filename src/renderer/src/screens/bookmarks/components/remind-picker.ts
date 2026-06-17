import { createOverlay, createButton } from '@crafterm/ui'
import type { Bookmark } from '../../../types'
import { makeCloseButton } from '../../../dialog'
import { snoozeReminder, snoozeOptions } from '../../../reminders'

// Quick "remind me about this bookmark" picker: one chip per snooze option.
// Uses a bare overlay (no Cancel/OK action row) to match the original modal.
export function showRemindPicker(bm: Bookmark): void {
  const ov = createOverlay({ closeOnBackdrop: true })
  const modal = document.createElement('div')
  modal.className = 'modal prompt-modal'
  ov.overlay.appendChild(modal)

  modal.appendChild(makeCloseButton(ov.close))
  const h = document.createElement('h2')
  h.textContent = 'Remind me about this'
  modal.appendChild(h)
  const sub = document.createElement('div')
  sub.className = 'field-hint'
  sub.textContent = bm.title
  modal.appendChild(sub)

  const chips = document.createElement('div')
  chips.className = 'bm-remind-chips'
  for (const opt of snoozeOptions()) {
    chips.appendChild(
      createButton({
        text: opt.label,
        className: 'bm-remind-chip',
        onClick: () => {
          snoozeReminder(`Bookmark: ${bm.title}`, opt.at, { kind: 'bookmark', bookmarkId: bm.id })
          ov.close()
        }
      })
    )
  }
  modal.appendChild(chips)
  ov.mount()
}
