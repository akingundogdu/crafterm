import type { Bookmark } from '@ui/types/types'
import { TYPE_LABEL } from '../bookmark-meta'
import { bookmarkReminder, formatReminderTime } from './bookmark-card.state'

export function createCardHeader(bm: Bookmark): HTMLElement {
  const rem = bookmarkReminder(bm.id)
  return (
    <div class="bookmarks-card-top">
      <span class={'bookmarks-type ' + bm.type}>{TYPE_LABEL[bm.type]}</span>
      <span class="bookmarks-title" title={bm.title}>
        {bm.title}
      </span>
      {rem && (
        <span class="bookmarks-remind-badge" title="A reminder is set for this bookmark">
          {`⏰ ${formatReminderTime(rem.time)}`}
        </span>
      )}
    </div>
  ) as HTMLDivElement
}
