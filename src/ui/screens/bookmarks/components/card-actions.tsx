import { createButton } from '@ui/components'
import { UITexts } from '@texts'
import type { Bookmark } from '@ui/types/types'
import type { BookmarkCardHandlers } from './bookmark-card.types'
import { makeOpenClick, makeCopyClick, makeRemindClick, makeEditClick, makeDeleteClick } from './bookmark-card.state'

export function createCardActions(bm: Bookmark, handlers: BookmarkCardHandlers): HTMLElement {
  return (
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
  ) as HTMLDivElement
}
