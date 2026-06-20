import type { Bookmark } from '@ui/types/types'
import { snoozeReminder } from '../../../screens/reminders/reminders'

// Click handler for a bookmark snooze chip: schedules the reminder, then closes.
export function makeBookmarkSnoozeClick(bm: Bookmark, at: number, close: () => void): () => void {
  return () => {
    snoozeReminder(`Bookmark: ${bm.title}`, at, { kind: 'bookmark', bookmarkId: bm.id })
    close()
  }
}
