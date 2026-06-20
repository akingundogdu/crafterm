import type { Bookmark } from '@ui/types/types'
import { bookmarkRepo } from '@repositories'
import type { TypeFilter } from './bookmarks.types'
import { showBookmarkForm } from './components/bookmark-form'

// The filter chips, in display order.
export const TYPE_FILTERS: TypeFilter[] = ['all', 'link', 'text', 'code', 'snippet']

let typeFilter: TypeFilter = 'all'
let tagFilter = ''
let query = ''

export function currentTypeFilter(): TypeFilter {
  return typeFilter
}
export function currentTagFilter(): string {
  return tagFilter
}
export function currentQuery(): string {
  return query
}

// The bookmarks matching the active type/tag/text filters.
export function filterBookmarks(): Bookmark[] {
  return bookmarkRepo.getAll().filter((b) => {
    if (typeFilter !== 'all' && b.type !== typeFilter) return false
    if (tagFilter && !b.tags.includes(tagFilter)) return false
    if (query) {
      const hay = `${b.title} ${b.content} ${b.tags.join(' ')}`.toLowerCase()
      if (!hay.includes(query)) return false
    }
    return true
  })
}

export function makeAddClick(rerender: () => void): () => void {
  return () => showBookmarkForm(undefined, rerender)
}

export function makeSearchInput(search: HTMLInputElement, renderList: () => void): () => void {
  return () => {
    query = search.value.trim().toLowerCase()
    renderList()
  }
}

export function makeTypeFilterClick(t: TypeFilter, rerender: () => void): () => void {
  return () => {
    typeFilter = t
    rerender()
  }
}

export function makeClearTagClick(rerender: () => void): () => void {
  return () => {
    tagFilter = ''
    rerender()
  }
}

export function makeTagFilter(rerender: () => void): (tag: string) => void {
  return (tag) => {
    tagFilter = tagFilter === tag ? '' : tag
    rerender()
  }
}
