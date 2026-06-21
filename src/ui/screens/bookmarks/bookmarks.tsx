import './bookmarks.css'
import { UITexts } from '@texts'
import { createButton } from '@ui/components'
import { bookmarkRepo } from '@repositories'
import { createBookmarkCard } from './components/bookmark-card'
import { createBookmarkToolbar } from './components/bookmark-toolbar'
import { createTypeFilterBar } from './components/type-filter-bar'
import {
  currentTagFilter,
  filterBookmarks,
  makeClearTagClick,
  makeTagFilter
} from './bookmarks.state'

const viewEl = (): HTMLElement => document.getElementById('notif-bm-view')!

export function renderBookmarks(): void {
  const el = viewEl()
  el.replaceChildren()

  const list = (<div class="bookmarks-list" />) as HTMLDivElement
  const renderList = (): void => {
    list.replaceChildren()
    const items = filterBookmarks()
    if (!items.length) {
      list.innerHTML = `<div class="notif-empty">${
        bookmarkRepo.getAll().length ? UITexts.Bookmarks.emptyMatching : UITexts.Bookmarks.emptyNone
      }</div>`
      return
    }
    for (const bm of items) {
      list.appendChild(
        createBookmarkCard(bm, { onChanged: renderBookmarks, onTagFilter: makeTagFilter(renderBookmarks) })
      )
    }
  }

  el.appendChild(createBookmarkToolbar({ onRerender: renderBookmarks, onRenderList: renderList }))
  el.appendChild(createTypeFilterBar({ onRerender: renderBookmarks }))

  if (currentTagFilter()) {
    el.appendChild(
      createButton({
        text: `tag: ${currentTagFilter()} ✕`,
        className: 'bookmarks-tagfilter',
        title: UITexts.Bookmarks.clearTagTitle,
        onClick: makeClearTagClick(renderBookmarks)
      })
    )
  }

  el.appendChild(list)
  renderList()
}
