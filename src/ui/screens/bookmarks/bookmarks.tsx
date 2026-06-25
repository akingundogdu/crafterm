import Bookmarks from '@views/screens/bookmarks/bookmarks'

// Bookmarks panel — migrated to gea (src/views/screens/bookmarks). This legacy
// entry point mounts the gea component into the right-panel tab host; the store
// singleton keeps the filter state across remounts.
export function renderBookmarks(): void {
  const el = document.getElementById('notif-bm-view')!
  el.replaceChildren()
  new Bookmarks().render(el)
}
