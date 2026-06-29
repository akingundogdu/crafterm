import { createOverlay } from '@views/components/overlay/overlay'
import type { Bookmark } from '@views/types/types'
import store from './bookmark-form.store'
import BookmarkForm from './bookmark-form'

// Opens the gea bookmark add/edit form: a @views overlay backdrop with the gea
// BookmarkForm body mounted inside. `onSaved` re-renders the list after upsert.
// Self-contained — no @ui (§2.7).
export function openBookmarkForm(existing: Bookmark | undefined, onSaved: () => void): void {
  const ov = createOverlay()
  store.open(existing, onSaved, () => ov.close())
  new BookmarkForm().render(ov.overlay)
  ov.mount()
  // Focus the title input (the first <input>; the type control is a <select>),
  // matching the legacy form. Done after mount so the node is in the document.
  ;(ov.overlay.querySelector('.bookmarks-form input') as HTMLInputElement | null)?.focus()
}
