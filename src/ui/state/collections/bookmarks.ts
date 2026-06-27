import type { Bookmark } from '@ui/types/types'

// Bookmarks collection — extracted from the catch-all `settings` object so each
// user-data entity owns its own array (was `settings.bookmarks`). Still persisted
// into the single crafterm-state.json by persistence.service; bookmarkRepo
// operates directly on this array. The array reference is stable (mutated in
// place by setBookmarks) so the repo's `() => bookmarks` accessor stays valid.
export const bookmarks: Bookmark[] = []

export function setBookmarks(next: Bookmark[]): void {
  bookmarks.length = 0
  bookmarks.push(...next)
}
