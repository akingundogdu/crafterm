import Docker from '@views/screens/docker/docker'
import store from '@views/screens/docker/docker.store'

// Docker panel — migrated to gea (src/views/screens/docker). This legacy entry
// point mounts the gea component into the sidebar tab-list host; the store
// singleton keeps the sub-tab + search state across remounts. `.docker-mode` on
// the host gives the flex-column layout (the gea root is display:contents).
export function renderDocker(el: HTMLElement): void {
  el.classList.add('docker-mode')
  el.replaceChildren()
  new Docker().render(el)
}

// The shared sidebar search box drives the reactive store filter.
export function dockerApplyQuery(q: string): void {
  store.setQuery(q)
}

// No special key handling yet; kept for parity with the other sidebar tool modes.
export function dockerHandleKey(_e: KeyboardEvent): void {}
