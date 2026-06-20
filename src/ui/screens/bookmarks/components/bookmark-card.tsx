import { createButton } from '@ui/components'
import { UITexts } from '@texts'
import type { Bookmark } from '@ui/types/types'
import { TYPE_LABEL } from '../bookmark-meta'
import type { BookmarkCardHandlers } from './bookmark-card.types'
import {
  bookmarkReminder,
  formatReminderTime,
  bodyClass,
  makeTagFilterClick,
  makeOpenClick,
  makeCopyClick,
  makeRemindClick,
  makeEditClick,
  makeDeleteClick
} from './bookmark-card.state'

export type { BookmarkCardHandlers } from './bookmark-card.types'

export function createBookmarkCard(bm: Bookmark, handlers: BookmarkCardHandlers): HTMLElement {
  const rem = bookmarkReminder(bm.id)
  return (
    <div class="bookmarks-card">
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
      <div class={bodyClass(bm)}>{bm.content}</div>
      {bm.tags.length > 0 && (
        <div class="bookmarks-tags">
          {bm.tags.map((t) =>
            createButton({
              text: t,
              className: 'bookmarks-tag',
              title: UITexts.Bookmarks.card.filterByTag,
              onClick: makeTagFilterClick(handlers, t)
            })
          )}
        </div>
      )}
      <div class="bookmarks-actions">
        {bm.type === 'link'
          ? createButton({
              text: UITexts.Bookmarks.card.open,
              className: 'bookmarks-action primary',
              onClick: makeOpenClick(bm)
            })
          : createButton({ text: 'Copy', className: 'bookmarks-action primary', onClick: makeCopyClick(bm) })}
        {createButton({ text: 'Remind', className: 'bookmarks-action', onClick: makeRemindClick(bm) })}
        {createButton({
          text: UITexts.Bookmarks.card.edit,
          className: 'bookmarks-action',
          onClick: makeEditClick(bm, handlers)
        })}
        {createButton({
          text: UITexts.Bookmarks.card.delete,
          className: 'bookmarks-action danger',
          onClick: makeDeleteClick(bm, handlers)
        })}
      </div>
    </div>
  ) as HTMLDivElement
}
