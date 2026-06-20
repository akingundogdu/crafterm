import { createOverlay, createButton } from '@ui/components'
import { UITexts } from '@texts'
import type { Bookmark } from '@ui/types/types'
import { makeCloseButton } from '@ui/dialog/dialog'
import { snoozeReminder, snoozeOptions } from '../../../screens/reminders/reminders'

// Quick "remind me about this bookmark" picker: one chip per snooze option.
// Uses a bare overlay (no Cancel/OK action row) to match the original modal.
export function showRemindPicker(bm: Bookmark): void {
  const ov = createOverlay({ closeOnBackdrop: true })

  const chips = (<div class="bookmarks-remind-chips" />) as HTMLDivElement
  for (const opt of snoozeOptions()) {
    chips.appendChild(
      createButton({
        text: opt.label,
        className: 'bookmarks-remind-chip',
        onClick: () => {
          snoozeReminder(`Bookmark: ${bm.title}`, opt.at, { kind: 'bookmark', bookmarkId: bm.id })
          ov.close()
        }
      })
    )
  }

  const modal = (
    <div class="modal modal-prompt">
      {makeCloseButton(ov.close)}
      <h2>{UITexts.Reminders.remindModalTitle}</h2>
      <div class="field-hint">{bm.title}</div>
      {chips}
    </div>
  ) as HTMLDivElement

  ov.overlay.appendChild(modal)
  ov.mount()
}
