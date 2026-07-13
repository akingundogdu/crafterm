import type { Bookmark } from '@views/types/types'
import { reminderRepo } from '@repositories'

// Pure / repo-only formatters for the bookmark card (extracted from the legacy
// @ui bookmark-card.state). Self-contained — no @ui (§2.7).

// The soonest still-armed reminder linked to a bookmark, or null. Used to show a
// "reminded" chip on the card.
export function bookmarkReminder(bookmarkId: string): { time: number } | null {
  const matches = reminderRepo.query(
    (r) => r.enabled && r.payload?.kind === 'bookmark' && r.payload.bookmarkId === bookmarkId
  )
  if (!matches.length) return null
  return matches.reduce((a, b) => (b.time < a.time ? b : a))
}

export function formatReminderTime(t: number): string {
  const d = new Date(t)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return sameDay ? time : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`
}

// Body uses a monospace variant for code/snippet bookmarks.
export function bodyClass(bm: Bookmark): string {
  return bm.type === 'code' || bm.type === 'snippet' ? 'bookmarks-body mono' : 'bookmarks-body'
}
