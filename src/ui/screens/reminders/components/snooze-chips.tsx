import { createButton } from '@ui/components'
import type { ReminderPayload } from '@ui/types/types'
import { snoozeOptions } from '../reminders'
import { makeSnoozeChipClick } from './remind-modal.state'

export function createSnoozeChips(
  reminderText: string,
  payload: ReminderPayload,
  close: () => void
): HTMLElement {
  return (
    <div class="bookmarks-remind-chips">
      {snoozeOptions().map((opt) =>
        createButton({
          text: opt.label,
          className: 'bookmarks-remind-chip',
          onClick: makeSnoozeChipClick(reminderText, opt.at, payload, close)
        })
      )}
    </div>
  ) as HTMLDivElement
}
