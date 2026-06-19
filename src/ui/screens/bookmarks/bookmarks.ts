import './bookmarks.css'
import { createButton, createInput } from '@ui/components'
import { bookmarkRepo } from '../../services/storage/repositories'
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

  const bar = document.createElement('div')
  bar.className = 'bookmarks-toolbar'
  const add = createButton({
    text: '+ Bookmark',
    className: 'settings-inline-btn',
    onClick: () => showBookmarkForm(undefined, renderBookmarks)
  })
  const search = createInput({ value: query, placeholder: 'Search…' })
  search.className = 'bookmarks-search'
  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase()
    renderList()
  })
  bar.append(add, search)
  el.appendChild(bar)

  // type filter chips
  const typeBar = document.createElement('div')
  typeBar.className = 'bookmarks-filters'
  ;(['all', 'link', 'text', 'code', 'snippet'] as TypeFilter[]).forEach((t) => {
    typeBar.appendChild(
      createButton({
        text: t === 'all' ? 'All' : TYPE_LABEL[t],
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
        title: 'Clear tag filter',
        onClick: () => {
          tagFilter = ''
          renderBookmarks()
        }
      })
    )
  }

  const list = document.createElement('div')
  list.className = 'bookmarks-list'
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
        bookmarkRepo.getAll().length ? 'No matching bookmarks' : 'No bookmarks yet. Add a link, text, code, or snippet.'
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
