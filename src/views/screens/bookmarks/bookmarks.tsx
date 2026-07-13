import '@views/screens/bookmarks/bookmarks.css'
import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import { bookmarkRepo } from '@repositories'
import { TYPE_FILTERS } from './bookmarks.store'
import { TYPE_LABEL } from '@views/screens/bookmarks/bookmark-meta'
import { openBookmarkForm } from './components/bookmark-form.open'
import BookmarkCard from './components/bookmark-card'
import store from './bookmarks.store'

// gea Bookmarks panel: toolbar (+ search) + type filter chips + optional
// tag-filter clear + a keyed card list, all reactive off the store. Replaces the
// legacy renderBookmarks() closure. The root is display:contents so its children
// lay out as direct children of the #notif-bm-view host (layout parity). The
// add/edit form and remind picker are reused from the legacy tree via @ui.
export default class Bookmarks extends Component {
  created(): void {
    store.reload()
  }

  template() {
    const items = store.filtered
    return (
      <div class="bookmarks-root" style={{ display: 'contents' }}>
        <div class="bookmarks-toolbar">
          <button class="settings-inline-btn" onClick={() => openBookmarkForm(undefined, () => store.reload())}>
            + Bookmark
          </button>
          <input
            class="bookmarks-search"
            placeholder={UITexts.Bookmarks.searchPlaceholder}
            value={store.query}
            onInput={(e: Event) => store.setQuery((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="bookmarks-filters">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t}
              class={'bookmarks-filter' + (t === store.typeFilter ? ' active' : '')}
              onClick={() => store.setType(t)}
            >
              {t === 'all' ? UITexts.Bookmarks.allFilter : TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        {store.tagFilter && (
          <button
            class="bookmarks-tagfilter"
            title={UITexts.Bookmarks.clearTagTitle}
            onClick={() => store.clearTag()}
          >
            {`tag: ${store.tagFilter} ✕`}
          </button>
        )}
        <div class="bookmarks-list">
          {items.map((bm) => (
            <BookmarkCard key={bm.id} bookmark={bm} />
          ))}
          {items.length === 0 && (
            <div class="notif-empty">
              {bookmarkRepo.getAll().length ? UITexts.Bookmarks.emptyMatching : UITexts.Bookmarks.emptyNone}
            </div>
          )}
        </div>
      </div>
    )
  }
}
