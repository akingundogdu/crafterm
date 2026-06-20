import { createModal, createField, createInput, createTextarea, createSelect } from '@ui/components'
import { UITexts } from '@texts'
import type { Bookmark } from '@ui/types/types'
import { uid } from '@ui/state/state'
import { bookmarkRepo } from '@repositories'
import { makeCloseButton } from '@ui/dialog/dialog'
import { TYPE_LABEL } from '../bookmark-meta'

// Add / edit modal for a bookmark. `onSaved` re-renders the list after upsert.
export function showBookmarkForm(existing: Bookmark | undefined, onSaved: () => void): void {
  const m = createModal({
    title: existing ? UITexts.Bookmarks.form.editTitle : UITexts.Bookmarks.form.newTitle,
    className: 'bookmarks-form',
    confirmText: UITexts.Bookmarks.form.save
  })

  let done = false
  const close = (): void => {
    if (done) return
    done = true
    document.removeEventListener('keydown', onKey, true)
    m.close()
  }
  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKey, true)
  m.onClose(close)
  m.modal.prepend(makeCloseButton(close))

  const typeSel = createSelect({
    options: (['link', 'text', 'code', 'snippet'] as Bookmark['type'][]).map((t) => ({
      value: t,
      label: TYPE_LABEL[t]
    })),
    value: existing?.type ?? 'link'
  })
  const titleInput = createInput({ value: existing?.title ?? '', placeholder: UITexts.Bookmarks.form.titlePlaceholder })
  const contentInput = createTextarea({ value: existing?.content ?? '', rows: 4 })
  const tagsInput = createInput({
    value: (existing?.tags ?? []).join(', '),
    placeholder: UITexts.Bookmarks.form.tagsPlaceholder
  })

  const contentField = createField('', contentInput)
  const contentLabel = contentField.querySelector('label')!
  const syncContentLabel = (): void => {
    const isLink = typeSel.value === 'link'
    contentLabel.textContent = isLink ? UITexts.Bookmarks.form.contentLabelUrl : UITexts.Bookmarks.form.contentLabel
    contentInput.placeholder = isLink ? UITexts.Bookmarks.form.urlPlaceholder : UITexts.Bookmarks.form.contentPlaceholder
  }
  syncContentLabel()
  typeSel.addEventListener('change', syncContentLabel)

  m.append(
    createField(UITexts.Bookmarks.form.fieldType, typeSel),
    createField(UITexts.Bookmarks.form.fieldTitle, titleInput),
    contentField,
    createField(UITexts.Bookmarks.form.fieldTags, tagsInput)
  )

  m.confirmBtn.addEventListener('click', () => {
    const title = titleInput.value.trim()
    const content = contentInput.value.trim()
    if (!title && !content) return
    const tags = tagsInput.value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    if (existing) {
      existing.type = typeSel.value as Bookmark['type']
      existing.title = title || content.slice(0, 40)
      existing.content = content
      existing.tags = tags
      bookmarkRepo.upsert(existing)
    } else {
      bookmarkRepo.upsert({
        id: uid('bm'),
        type: typeSel.value as Bookmark['type'],
        title: title || content.slice(0, 40),
        content,
        tags,
        createdAt: Date.now()
      })
    }
    close()
    onSaved()
  })
  m.cancelBtn.addEventListener('click', close)

  m.mount()
  titleInput.focus()
}
