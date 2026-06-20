import type { Bookmark } from '@ui/types/types'
import { uid } from '@ui/state/state'
import { bookmarkRepo } from '@repositories'
import { UITexts } from '@texts'

// The live form controls the handlers operate on.
export interface BookmarkFormControls {
  typeSel: HTMLSelectElement
  titleInput: HTMLInputElement
  contentInput: HTMLTextAreaElement
  tagsInput: HTMLInputElement
  contentLabel: HTMLLabelElement
}

// `change` handler: swaps the content field's label + placeholder between the
// URL wording (type 'link') and the generic content wording.
export function makeSyncContentLabel(c: BookmarkFormControls): () => void {
  return () => {
    const isLink = c.typeSel.value === 'link'
    c.contentLabel.textContent = isLink
      ? UITexts.Bookmarks.form.contentLabelUrl
      : UITexts.Bookmarks.form.contentLabel
    c.contentInput.placeholder = isLink
      ? UITexts.Bookmarks.form.urlPlaceholder
      : UITexts.Bookmarks.form.contentPlaceholder
  }
}

// Confirm handler: validates, upserts (in place when editing), then closes +
// notifies. A blank title falls back to the first 40 chars of the content.
export function makeSaveBookmark(
  c: BookmarkFormControls,
  existing: Bookmark | undefined,
  close: () => void,
  onSaved: () => void
): () => void {
  return () => {
    const title = c.titleInput.value.trim()
    const content = c.contentInput.value.trim()
    if (!title && !content) return
    const tags = c.tagsInput.value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    if (existing) {
      existing.type = c.typeSel.value as Bookmark['type']
      existing.title = title || content.slice(0, 40)
      existing.content = content
      existing.tags = tags
      bookmarkRepo.upsert(existing)
    } else {
      bookmarkRepo.upsert({
        id: uid('bm'),
        type: c.typeSel.value as Bookmark['type'],
        title: title || content.slice(0, 40),
        content,
        tags,
        createdAt: Date.now()
      })
    }
    close()
    onSaved()
  }
}

// keydown handler: Escape closes the form (and always stops propagation).
export function makeEscapeClose(close: () => void): (e: KeyboardEvent) => void {
  return (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  }
}
