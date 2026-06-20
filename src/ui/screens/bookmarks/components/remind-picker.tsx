import { createOverlay, createButton } from '@ui/components'
import { UITexts } from '@texts'
import type { Bookmark } from '@ui/types/types'
import { makeCloseButton } from '@ui/dialog/dialog'
import { snoozeOptions } from '../../../screens/reminders/reminders'
import { makeBookmarkSnoozeClick } from './remind-picker.state'

// Quick "remind me about this bookmark" picker: one chip per snooze option.
// Uses a bare overlay (no Cancel/OK action row) to match the original modal.
export function showRemindPicker(bm: Bookmark): void {
  const ov = createOverlay({ closeOnBackdrop: true })

  const chips = (
    <div class="bookmarks-remind-chips">
      {snoozeOptions().map((opt) =>
        createButton({
          text: opt.label,
          className: 'bookmarks-remind-chip',
          onClick: makeBookmarkSnoozeClick(bm, opt.at, ov.close)
        })
      )}
    </div>
  ) as HTMLDivElement

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
