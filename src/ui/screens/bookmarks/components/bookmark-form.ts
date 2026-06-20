import { createModal, createField, createInput, createTextarea, createSelect } from '@ui/components'
import { UITexts } from '@texts'
import type { Bookmark } from '@ui/types/types'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { TYPE_LABEL } from '../bookmark-meta'
import {
  type BookmarkFormControls,
  makeSyncContentLabel,
  makeSaveBookmark,
  makeEscapeClose
} from './bookmark-form.state'

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
  const onKey = makeEscapeClose(close)
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
  const titleInput = createInput({
    value: existing?.title ?? '',
    placeholder: UITexts.Bookmarks.form.titlePlaceholder
  })
  const contentInput = createTextarea({ value: existing?.content ?? '', rows: 4 })
  const tagsInput = createInput({
    value: (existing?.tags ?? []).join(', '),
    placeholder: UITexts.Bookmarks.form.tagsPlaceholder
  })

  const contentField = createField('', contentInput)
  const contentLabel = contentField.querySelector('label')!
  const controls: BookmarkFormControls = { typeSel, titleInput, contentInput, tagsInput, contentLabel }

  const syncContentLabel = makeSyncContentLabel(controls)
  syncContentLabel()
  typeSel.addEventListener('change', syncContentLabel)

  m.append(
    createField(UITexts.Bookmarks.form.fieldType, typeSel),
    createField(UITexts.Bookmarks.form.fieldTitle, titleInput),
    contentField,
    createField(UITexts.Bookmarks.form.fieldTags, tagsInput)
  )

  m.confirmBtn.addEventListener('click', makeSaveBookmark(controls, existing, close, onSaved))
  m.cancelBtn.addEventListener('click', close)

  m.mount()
  titleInput.focus()
}
