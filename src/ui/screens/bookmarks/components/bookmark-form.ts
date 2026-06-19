import { createModal, createField, createInput, createTextarea, createSelect } from '@ui/components'
import type { Bookmark } from '../../../types'
import { uid } from '../../../state'
import { bookmarkRepo } from '@services/storage/repositories'
import { makeCloseButton } from '../../../dialog'
import { TYPE_LABEL } from '../bookmark-meta'

// Add / edit modal for a bookmark. `onSaved` re-renders the list after upsert.
export function showBookmarkForm(existing: Bookmark | undefined, onSaved: () => void): void {
  const m = createModal({
    title: existing ? 'Edit bookmark' : 'New bookmark',
    className: 'bookmarks-form',
    confirmText: 'Save'
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
  const titleInput = createInput({ value: existing?.title ?? '', placeholder: 'A short name' })
  const contentInput = createTextarea({ value: existing?.content ?? '', rows: 4 })
  const tagsInput = createInput({
    value: (existing?.tags ?? []).join(', '),
    placeholder: 'reading, infra'
  })

  const contentField = createField('', contentInput)
  const contentLabel = contentField.querySelector('label')!
  const syncContentLabel = (): void => {
    const isLink = typeSel.value === 'link'
    contentLabel.textContent = isLink ? 'URL' : 'Content'
    contentInput.placeholder = isLink ? 'https://…' : 'Paste your text, code, or snippet'
  }
  syncContentLabel()
  typeSel.addEventListener('change', syncContentLabel)

  m.append(
    createField('Type', typeSel),
    createField('Title', titleInput),
    contentField,
    createField('Tags (comma separated)', tagsInput)
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
