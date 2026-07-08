import type { DirEntry } from '@services/fs/fs.types'
import { settings } from '@views/state/spine'
import { overlayModal } from '../shared'
import { UITexts } from '@texts'
import { filterDirs, makeOpenHere, loadFolderListing } from './folder.state'
import store from './folder.store'
import FolderPickerView, { type FolderPickerDeps } from './components/folder-picker-view'

// ---- Pick a folder (returns its path) — used by Settings to choose md folders ----
// Owns the folder-pick overlay: seeds the reactive folder.store, mounts the gea
// picker view, wires outside-click + keyboard navigation, and resolves the caller's
// promise with the chosen path (or null). The reactive DOM lives in FolderPickerView
// / FolderList reading folder.store; the async load lives in folder.state
// (loadFolderListing) and the selection/drill state is store fields.
export function pickFolderPath(startDir?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const { overlay, modal, close } = overlayModal('picker-modal')
    store.reset()

    let settled = false
    const finish = (val: string | null): void => {
      if (settled) return
      settled = true
      close()
      resolve(val)
    }

    const filtered = (): DirEntry[] => filterDirs(store.dirs, store.search)

    const onKey = (e: KeyboardEvent): void => {
      e.stopPropagation()
      const items = filtered()
      if (e.key === 'Escape') finish(null)
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        store.setSel(Math.min(items.length - 1, store.sel + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        store.setSel(Math.max(0, store.sel - 1))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (items[store.sel]) void loadFolderListing(items[store.sel].path)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (store.parent) void loadFolderListing(store.parent)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (items[store.sel]) finish(items[store.sel].path)
      }
    }

    const deps: FolderPickerDeps = {
      placeholder: UITexts.Pickers.folder.pickPlaceholder,
      showUse: true,
      onUse: () => finish(store.path),
      onSelect: (d) => finish(d.path),
      onDrill: (d) => void loadFolderListing(d.path),
      onHover: (i) => store.setSel(i),
      onKeyDown: onKey
    }
    new FolderPickerView(deps).render(modal)

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) finish(null)
    })

    void loadFolderListing(startDir ?? (settings.codeRoot || undefined))
    ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
  })
}

// ---- Cmd+P: browse folders from the code root, open one in a new terminal ----
// Owns the folder-browse overlay: seeds the reactive folder.store, mounts the gea
// picker view, and wires keyboard navigation. Selecting a folder opens it in a new
// terminal. The reactive DOM lives in FolderPickerView / FolderList reading
// folder.store; the async load lives in folder.state (loadFolderListing) and the
// selection/drill state is store fields.
export async function showFolderPicker(): Promise<void> {
  const { modal, close } = overlayModal('picker-modal')
  store.reset()
  const openHere = makeOpenHere(close)

  const filtered = (): DirEntry[] => filterDirs(store.dirs, store.search)

  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    const items = filtered()
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      store.setSel(Math.min(items.length - 1, store.sel + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      store.setSel(Math.max(0, store.sel - 1))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (items[store.sel]) void loadFolderListing(items[store.sel].path)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (store.parent) void loadFolderListing(store.parent)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[store.sel]) openHere(items[store.sel].path)
    }
  }

  const deps: FolderPickerDeps = {
    placeholder: UITexts.Pickers.folder.openPlaceholder,
    showUse: false,
    onUse: () => {},
    onSelect: (d) => openHere(d.path),
    onDrill: (d) => void loadFolderListing(d.path),
    onHover: (i) => store.setSel(i),
    onKeyDown: onKey
  }
  new FolderPickerView(deps).render(modal)

  await loadFolderListing(settings.codeRoot || undefined)
  ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
}
