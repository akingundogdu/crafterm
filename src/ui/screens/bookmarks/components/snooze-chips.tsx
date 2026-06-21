import { createButton } from '@ui/components'
import type { Bookmark } from '@ui/types/types'
import { snoozeOptions } from '../../../screens/reminders/reminders'
import { makeBookmarkSnoozeClick } from './remind-picker.state'

export function createSnoozeChips(bm: Bookmark, close: () => void): HTMLElement {
  return (
    <div class="bookmarks-remind-chips">
      {snoozeOptions().map((opt) =>
        createButton({
          text: opt.label,
          className: 'bookmarks-remind-chip',
          onClick: makeBookmarkSnoozeClick(bm, opt.at, close)
        })
      )}
    </div>
  ) as HTMLDivElement
}
