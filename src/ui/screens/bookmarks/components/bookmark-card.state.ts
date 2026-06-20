import type { Bookmark } from '@ui/types/types'
import { bookmarkRepo, reminderRepo } from '@repositories'
import { UITexts } from '@texts'
import { openLink } from '@ui/commands/commands'
import { promptConfirm } from '@ui/components/dialog/dialog'
import { showBookmarkForm } from './bookmark-form'
import { showRemindPicker } from './remind-picker'
import type { BookmarkCardHandlers } from './bookmark-card.types'

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

export function makeTagFilterClick(handlers: BookmarkCardHandlers, tag: string): () => void {
  return () => handlers.onTagFilter(tag)
}

export function makeOpenClick(bm: Bookmark): () => void {
  return () => void openLink(bm.content)
}

// Copies the content and flashes a "Copied" label on the clicked button.
export function makeCopyClick(bm: Bookmark): (e: Event) => void {
  return (e) => {
    void navigator.clipboard.writeText(bm.content)
    const btn = e.currentTarget as HTMLButtonElement
    const prev = btn.textContent
    btn.textContent = UITexts.Bookmarks.card.copied
    setTimeout(() => (btn.textContent = prev), 1100)
  }
}

export function makeRemindClick(bm: Bookmark): () => void {
  return () => showRemindPicker(bm)
}

export function makeEditClick(bm: Bookmark, handlers: BookmarkCardHandlers): () => void {
  return () => showBookmarkForm(bm, handlers.onChanged)
}

export function makeDeleteClick(bm: Bookmark, handlers: BookmarkCardHandlers): () => Promise<void> {
  return async () => {
    const ok = await promptConfirm({
      title: UITexts.Bookmarks.card.deleteTitle,
      message: bm.title,
      confirmText: UITexts.Bookmarks.card.deleteConfirm
    })
    if (!ok) return
    bookmarkRepo.remove(bm.id)
    handlers.onChanged()
  }
}
