import './bookmarks.css'
import { UITexts } from '@texts'
import { createButton, createInput } from '@ui/components'
import { bookmarkRepo } from '@repositories'
import { TYPE_LABEL } from './bookmark-meta'
import { createBookmarkCard } from './components/bookmark-card'
import {
  TYPE_FILTERS,
  currentTypeFilter,
  currentTagFilter,
  currentQuery,
  filterBookmarks,
  makeAddClick,
  makeSearchInput,
  makeTypeFilterClick,
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

  const add = createButton({
    text: '+ Bookmark',
    className: 'settings-inline-btn',
    onClick: makeAddClick(renderBookmarks)
  })
  const search = createInput({ value: currentQuery(), placeholder: UITexts.Bookmarks.searchPlaceholder })
  search.className = 'bookmarks-search'
  search.addEventListener('input', makeSearchInput(search, renderList))

  const bar = (
    <div class="bookmarks-toolbar">
      {add}
      {search}
    </div>
  ) as HTMLDivElement
  el.appendChild(bar)

  const typeBar = (
    <div class="bookmarks-filters">
      {TYPE_FILTERS.map((t) =>
        createButton({
          text: t === 'all' ? UITexts.Bookmarks.allFilter : TYPE_LABEL[t],
          className: 'bookmarks-filter' + (t === currentTypeFilter() ? ' active' : ''),
          onClick: makeTypeFilterClick(t, renderBookmarks)
        })
      )}
    </div>
  ) as HTMLDivElement
  el.appendChild(typeBar)

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
