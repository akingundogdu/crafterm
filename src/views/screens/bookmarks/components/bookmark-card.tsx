import { Component } from '@geajs/core'
import type { Bookmark } from '@views/types/types'
import { UITexts } from '@texts'
import { bookmarkRepo } from '@repositories'
import { openLink } from '@views/commands/commands'
import { promptConfirm } from '@views/components/dialog/confirm'
import { openBookmarkForm } from './bookmark-form.open'
import { showRemindPicker } from './remind-picker.open'
import { TYPE_LABEL } from '@views/screens/bookmarks/bookmark-meta'
import { bookmarkReminder, formatReminderTime, bodyClass } from '@views/screens/bookmarks/components/bookmark-card.format'
import store from '../bookmarks.store'

// gea port of the bookmark card (header + body + tags + actions inlined). Read
// flows (open/copy) take the reactive prop; mutating legacy flows (edit/remind)
// take the RAW repo object (assigning through a gea proxy throws).
export default class BookmarkCard extends Component {
  declare props: { bookmark: Bookmark }

  private raw = (): Bookmark =>
    bookmarkRepo.getAll().find((b) => b.id === this.props.bookmark.id) ?? this.props.bookmark

  private onDelete = async (): Promise<void> => {
    const bm = this.props.bookmark
    const ok = await promptConfirm({
      title: UITexts.Bookmarks.card.deleteTitle,
      message: bm.title,
      confirmText: UITexts.Bookmarks.card.deleteConfirm
    })
    if (ok) store.remove(bm.id)
  }

  private onCopy = (e: MouseEvent): void => {
    void navigator.clipboard.writeText(this.props.bookmark.content)
    const btn = e.currentTarget as HTMLButtonElement
    const prev = btn.textContent
    btn.textContent = UITexts.Bookmarks.card.copied
    setTimeout(() => (btn.textContent = prev), 1100)
  }

  template({ bookmark: bm }: this['props']) {
    const rem = bookmarkReminder(bm.id)
    return (
      <div class="bookmarks-card">
        <div class="bookmarks-card-top">
          <span class={'bookmarks-type ' + bm.type}>{TYPE_LABEL[bm.type]}</span>
          <span class="bookmarks-title" title={bm.title}>
            {bm.title}
          </span>
          {rem && (
            <span class="bookmarks-remind-badge" title="A reminder is set for this bookmark">
              {`⏰ ${formatReminderTime(rem.time)}`}
            </span>
          )}
        </div>
        <div class={bodyClass(bm)}>{bm.content}</div>
        {bm.tags.length > 0 && (
          <div class="bookmarks-tags">
            {bm.tags.map((t) => (
              <button
                key={t}
                class="bookmarks-tag"
                title={UITexts.Bookmarks.card.filterByTag}
                onClick={() => store.toggleTag(t)}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        <div class="bookmarks-actions">
          {bm.type === 'link' ? (
            <button class="bookmarks-action button-primary" onClick={() => void openLink(bm.content)}>
              {UITexts.Bookmarks.card.open}
            </button>
          ) : (
            <button class="bookmarks-action button-primary" onClick={this.onCopy}>
              Copy
            </button>
          )}
          <button class="bookmarks-action" onClick={() => showRemindPicker(this.raw())}>
            Remind
          </button>
          <button class="bookmarks-action" onClick={() => openBookmarkForm(this.raw(), () => store.reload())}>
            {UITexts.Bookmarks.card.edit}
          </button>
          <button class="bookmarks-action button-danger" onClick={this.onDelete}>
            {UITexts.Bookmarks.card.delete}
          </button>
        </div>
      </div>
    )
  }
}
