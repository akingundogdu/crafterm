import { Store } from '@geajs/core'
import { bookmarkRepo } from '@repositories'
import { UITexts } from '@texts'
import type { Bookmark } from '@views/types/types'
import { uid } from '@views/lib/uid'

// Reactive state + logic for the gea bookmark add/edit form (merges the legacy
// bookmark-form.state helpers + the imperative wiring). A singleton reset on each
// open (the improve-crafterm pattern): `open()` seeds the fields + the close/saved
// callbacks, the component reads the reactive fields, and `save()` upserts through
// bookmarkRepo (the persisted source of truth). Self-contained — no @ui (§2.7).
class BookmarkFormStore extends Store {
  type: Bookmark['type'] = 'link'
  title = ''
  content = ''
  tags = ''
  existing: Bookmark | undefined = undefined

  private onSaved: () => void = () => {}
  private closeFn: () => void = () => {}

  open(existing: Bookmark | undefined, onSaved: () => void, close: () => void): void {
    this.existing = existing
    this.type = existing?.type ?? 'link'
    this.title = existing?.title ?? ''
    this.content = existing?.content ?? ''
    this.tags = (existing?.tags ?? []).join(', ')
    this.onSaved = onSaved
    this.closeFn = close
  }

  get isLink(): boolean {
    return this.type === 'link'
  }

  // The content field's label + placeholder swap between URL wording (type 'link')
  // and the generic content wording — the legacy syncContentLabel, now reactive.
  get contentLabel(): string {
    return this.isLink ? UITexts.Bookmarks.form.contentLabelUrl : UITexts.Bookmarks.form.contentLabel
  }

  get contentPlaceholder(): string {
    return this.isLink ? UITexts.Bookmarks.form.urlPlaceholder : UITexts.Bookmarks.form.contentPlaceholder
  }

  get titleText(): string {
    return this.existing ? UITexts.Bookmarks.form.editTitle : UITexts.Bookmarks.form.newTitle
  }

  setType(t: Bookmark['type']): void {
    this.type = t
  }

  close(): void {
    this.closeFn()
  }

  // Validates, upserts (a blank title falls back to the first 40 chars of the
  // content), then closes + notifies. Builds a fresh object via spread so a
  // reactive proxy is only ever READ, never assigned to (§5.3).
  save(): void {
    const title = this.title.trim()
    const content = this.content.trim()
    if (!title && !content) return
    const tags = this.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const base: Bookmark = this.existing
      ? { ...this.existing }
      : { id: uid('bm'), type: this.type, title: '', content: '', tags: [], createdAt: Date.now() }
    bookmarkRepo.upsert({
      ...base,
      type: this.type,
      title: title || content.slice(0, 40),
      content,
      tags
    })
    this.close()
    this.onSaved()
  }
}

export default new BookmarkFormStore()
