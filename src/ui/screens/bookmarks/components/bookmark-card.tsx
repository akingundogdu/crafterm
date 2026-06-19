import { createButton } from '@ui/components'
import type { Bookmark } from '../../../types'
import { bookmarkRepo, reminderRepo } from '@services/storage/repositories'
import { openLink } from '../../../commands'
import { promptConfirm } from '../../../dialog'
import { TYPE_LABEL } from '../bookmark-meta'
import { showBookmarkForm } from './bookmark-form'
import { showRemindPicker } from './remind-picker'

// The soonest still-armed reminder linked to a bookmark, or null. Used to show a
// "reminded" chip on the card.
function bookmarkReminder(bookmarkId: string): { time: number } | null {
  const matches = reminderRepo.query(
    (r) => r.enabled && r.payload?.kind === 'bookmark' && r.payload.bookmarkId === bookmarkId
  )
  if (!matches.length) return null
  return matches.reduce((a, b) => (b.time < a.time ? b : a))
}

function formatReminderTime(t: number): string {
  const d = new Date(t)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return sameDay ? time : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`
}

function copyContent(bm: Bookmark, btn: HTMLButtonElement): void {
  void navigator.clipboard.writeText(bm.content)
  const prev = btn.textContent
  btn.textContent = 'Copied'
  setTimeout(() => (btn.textContent = prev), 1100)
}

export interface BookmarkCardHandlers {
  onChanged: () => void
  onTagFilter: (tag: string) => void
}

export function createBookmarkCard(bm: Bookmark, handlers: BookmarkCardHandlers): HTMLElement {
  const top = (
    <div class="bookmarks-card-top">
      <span class={'bookmarks-type ' + bm.type}>{TYPE_LABEL[bm.type]}</span>
      <span class="bookmarks-title" title={bm.title}>
        {bm.title}
      </span>
    </div>
  ) as HTMLDivElement
  const rem = bookmarkReminder(bm.id)
  if (rem) {
    const chip = (
      <span class="bookmarks-remind-badge" title="A reminder is set for this bookmark">
        {`⏰ ${formatReminderTime(rem.time)}`}
      </span>
    ) as HTMLSpanElement
    top.appendChild(chip)
  }

  const body = (
    <div class={bm.type === 'code' || bm.type === 'snippet' ? 'bookmarks-body mono' : 'bookmarks-body'}>
      {bm.content}
    </div>
  ) as HTMLDivElement

  const el = (
    <div class="bookmarks-card">
      {top}
      {body}
    </div>
  ) as HTMLDivElement

  if (bm.tags.length) {
    const tags = (<div class="bookmarks-tags" />) as HTMLDivElement
    bm.tags.forEach((t) => {
      tags.appendChild(
        createButton({
          text: t,
          className: 'bookmarks-tag',
          title: 'Filter by tag',
          onClick: () => handlers.onTagFilter(t)
        })
      )
    })
    el.appendChild(tags)
  }

  const acts = (<div class="bookmarks-actions" />) as HTMLDivElement
  if (bm.type === 'link') {
    acts.appendChild(
      createButton({
        text: 'Open',
        className: 'bookmarks-act primary',
        onClick: () => void openLink(bm.content)
      })
    )
  } else {
    const copy = createButton({ text: 'Copy', className: 'bookmarks-act primary' })
    copy.addEventListener('click', () => copyContent(bm, copy))
    acts.appendChild(copy)
  }
  acts.append(
    createButton({ text: 'Remind', className: 'bookmarks-act', onClick: () => showRemindPicker(bm) }),
    createButton({
      text: 'Edit',
      className: 'bookmarks-act',
      onClick: () => showBookmarkForm(bm, handlers.onChanged)
    }),
    createButton({
      text: 'Delete',
      className: 'bookmarks-act danger',
      onClick: async () => {
        const ok = await promptConfirm({ title: 'Delete bookmark', message: bm.title, confirmText: 'Delete' })
        if (!ok) return
        bookmarkRepo.remove(bm.id)
        handlers.onChanged()
      }
    })
  )
  el.appendChild(acts)
  return el
}
