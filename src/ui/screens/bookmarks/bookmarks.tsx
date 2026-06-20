import './bookmarks.css'
import { UITexts } from '@texts'
import { createButton, createInput } from '@ui/components'
import { bookmarkRepo } from '@repositories'
import { TYPE_LABEL, type TypeFilter } from './bookmark-meta'
import { showBookmarkForm } from './components/bookmark-form'
import { createBookmarkCard } from './components/bookmark-card'

const viewEl = (): HTMLElement => document.getElementById('notif-bm-view')!

let typeFilter: TypeFilter = 'all'
let tagFilter = ''
let query = ''

export function renderBookmarks(): void {
  const el = viewEl()
  el.replaceChildren()

  const add = createButton({
    text: '+ Bookmark',
    className: 'settings-inline-btn',
    onClick: () => showBookmarkForm(undefined, renderBookmarks)
  })
  const search = createInput({ value: query, placeholder: UITexts.Bookmarks.searchPlaceholder })
  search.className = 'bookmarks-search'
  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase()
    renderList()
  })
  const bar = (
    <div class="bookmarks-toolbar">
      {add}
      {search}
    </div>
  ) as HTMLDivElement
  el.appendChild(bar)

  // type filter chips
  const typeBar = (<div class="bookmarks-filters" />) as HTMLDivElement
  ;(['all', 'link', 'text', 'code', 'snippet'] as TypeFilter[]).forEach((t) => {
    typeBar.appendChild(
      createButton({
        text: t === 'all' ? UITexts.Bookmarks.allFilter : TYPE_LABEL[t],
        className: 'bookmarks-filter' + (t === typeFilter ? ' active' : ''),
        onClick: () => {
          typeFilter = t
          renderBookmarks()
        }
      })
    )
  })
  el.appendChild(typeBar)

  // active tag filter indicator
  if (tagFilter) {
    el.appendChild(
      createButton({
        text: `tag: ${tagFilter} ✕`,
        className: 'bookmarks-tagfilter',
        title: UITexts.Bookmarks.clearTagTitle,
        onClick: () => {
          tagFilter = ''
          renderBookmarks()
        }
      })
    )
  }

  const list = (<div class="bookmarks-list" />) as HTMLDivElement
  el.appendChild(list)

  const renderList = (): void => {
    list.replaceChildren()
    const items = bookmarkRepo.getAll().filter((b) => {
      if (typeFilter !== 'all' && b.type !== typeFilter) return false
      if (tagFilter && !b.tags.includes(tagFilter)) return false
      if (query) {
        const hay = `${b.title} ${b.content} ${b.tags.join(' ')}`.toLowerCase()
        if (!hay.includes(query)) return false
      }
      return true
    })
    if (!items.length) {
      list.innerHTML = `<div class="notif-empty">${
        bookmarkRepo.getAll().length ? UITexts.Bookmarks.emptyMatching : UITexts.Bookmarks.emptyNone
      }</div>`
      return
    }
    for (const bm of items) {
      list.appendChild(
        createBookmarkCard(bm, {
          onChanged: renderBookmarks,
          onTagFilter: (t) => {
            tagFilter = tagFilter === t ? '' : t
            renderBookmarks()
          }
        })
      )
    }
  }
  renderList()
}
