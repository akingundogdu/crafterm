import { Store } from '@geajs/core'
import type { Bookmark } from '@views/types/types'
import type { TypeFilter } from '@views/screens/bookmarks/bookmarks.types'
import { bookmarkRepo } from '@repositories'

// Reactive state for the gea Bookmarks panel. bookmarkRepo stays the persisted
// source of truth; this store mirrors it into a reactive array so gea patches the
// list on mutation, replacing the legacy renderBookmarks()/replaceChildren cycle.
// `query` holds the raw input text (lowercased only when filtering) so the bound
// search input never visibly transforms what the user typed.
class BookmarksStore extends Store {
  items: Bookmark[] = []
  typeFilter: TypeFilter = 'all'
  tagFilter = ''
  query = ''

  reload(): void {
    this.items = [...bookmarkRepo.getAll()]
  }

  get filtered(): Bookmark[] {
    const q = this.query.trim().toLowerCase()
    return this.items.filter((b) => {
      if (this.typeFilter !== 'all' && b.type !== this.typeFilter) return false
      if (this.tagFilter && !b.tags.includes(this.tagFilter)) return false
      if (q) {
        const hay = `${b.title} ${b.content} ${b.tags.join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }

  setType(t: TypeFilter): void {
    this.typeFilter = t
  }

  toggleTag(tag: string): void {
    this.tagFilter = this.tagFilter === tag ? '' : tag
  }

  clearTag(): void {
    this.tagFilter = ''
  }

  setQuery(v: string): void {
    this.query = v
  }

  remove(id: string): void {
    bookmarkRepo.remove(id)
    this.reload()
  }
}

export default new BookmarksStore()
