import { createButton } from '@ui/components'
import { UITexts } from '@texts'
import type { Bookmark } from '@ui/types/types'
import type { BookmarkCardHandlers } from './bookmark-card.types'
import { makeTagFilterClick } from './bookmark-card.state'

export function createCardTags(bm: Bookmark, handlers: BookmarkCardHandlers): HTMLElement | null {
  if (bm.tags.length === 0) return null
  return (
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
  ) as HTMLDivElement
}
