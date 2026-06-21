import type { Bookmark } from '@ui/types/types'
import type { BookmarkCardHandlers } from './bookmark-card.types'
import { createCardHeader } from './card-header'
import { createCardBody } from './card-body'
import { createCardTags } from './card-tags'
import { createCardActions } from './card-actions'

export type { BookmarkCardHandlers } from './bookmark-card.types'

export function createBookmarkCard(bm: Bookmark, handlers: BookmarkCardHandlers): HTMLElement {
  return (
    <div class="bookmarks-card">
      {createCardHeader(bm)}
      {createCardBody(bm)}
      {createCardTags(bm, handlers)}
      {createCardActions(bm, handlers)}
    </div>
  ) as HTMLDivElement
}
