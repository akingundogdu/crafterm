import { UITexts } from '@texts'
import { createButton, createInput } from '@ui/components'
import { currentQuery, makeAddClick, makeSearchInput } from '../bookmarks.state'

// The bookmarks toolbar: the "+ Bookmark" add button and the search input.

export interface BookmarkToolbarOptions {
  onRerender: () => void
  onRenderList: () => void
}

export function createBookmarkToolbar(opts: BookmarkToolbarOptions): HTMLElement {
  const add = createButton({
    text: '+ Bookmark',
    className: 'settings-inline-btn',
    onClick: makeAddClick(opts.onRerender)
  })
  const search = createInput({ value: currentQuery(), placeholder: UITexts.Bookmarks.searchPlaceholder })
  search.className = 'bookmarks-search'
  search.addEventListener('input', makeSearchInput(search, opts.onRenderList))

  return (
    <div class="bookmarks-toolbar">
      {add}
      {search}
    </div>
  ) as HTMLDivElement
}
