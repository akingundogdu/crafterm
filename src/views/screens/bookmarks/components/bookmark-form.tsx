import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { Bookmark } from '@views/types/types'
import '@views/components/form-field/form-field.css'
import Input from '@views/components/input/input'
import Textarea from '@views/components/textarea/textarea'
import Button from '@views/components/button/button'
import { TYPE_LABEL } from '@views/screens/bookmarks/bookmark-meta'
import store from './bookmark-form.store'

const TYPES: Bookmark['type'][] = ['link', 'text', 'code', 'snippet']

// gea bookmark add/edit form body, mounted into the @views overlay backdrop by
// openBookmarkForm. Renders the `.modal.modal-prompt.bookmarks-form` shell with a
// close button, title, the four fields (built from the gea form primitives), and
// the Cancel/Save actions. State + persistence live in the store. Self-contained
// — no @ui (§2.7).
export default class BookmarkForm extends Component {
  template() {
    return (
      <div
        class="modal modal-prompt bookmarks-form"
        tabIndex={-1}
        onKeyDown={(e: KeyboardEvent) => {
          e.stopPropagation()
          if (e.key === 'Escape') store.close()
        }}
      >
        <button
          class="modal-close"
          type="button"
          aria-label="Close"
          title="Close (Esc)"
          onClick={() => store.close()}
        >
          ×
        </button>
        <h2>{store.titleText}</h2>
        <div class="field">
          <label>{UITexts.Bookmarks.form.fieldType}</label>
          <select
            onChange={(e: Event) => store.setType((e.target as HTMLSelectElement).value as Bookmark['type'])}
          >
            {TYPES.map((t) => (
              <option key={t} value={t} selected={t === store.type}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label>{UITexts.Bookmarks.form.fieldTitle}</label>
          <Input
            value={store.title}
            placeholder={UITexts.Bookmarks.form.titlePlaceholder}
            onInput={(e: Event) => (store.title = (e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="field">
          <label>{store.contentLabel}</label>
          <Textarea
            value={store.content}
            rows={4}
            placeholder={store.contentPlaceholder}
            onInput={(e: Event) => (store.content = (e.target as HTMLTextAreaElement).value)}
          />
        </div>
        <div class="field">
          <label>{UITexts.Bookmarks.form.fieldTags}</label>
          <Input
            value={store.tags}
            placeholder={UITexts.Bookmarks.form.tagsPlaceholder}
            onInput={(e: Event) => (store.tags = (e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="modal-actions">
          <Button text="Cancel" onClick={() => store.close()} />
          <Button text={UITexts.Bookmarks.form.save} variant="primary" onClick={() => store.save()} />
        </div>
      </div>
    )
  }
}
