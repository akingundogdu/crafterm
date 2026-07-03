import type { DirEntry } from '@services/fs/fs.types'
import { settings } from '@views/state/spine'
import { dirService } from '@services'
import { overlayModal } from '../shared'
import { UITexts } from '@texts'
import { filterDirs, makeOpenHere } from './folder.state'
import store from './folder.store'
import FolderPickerView, { type FolderPickerDeps } from './components/folder-picker-view'

// Owns the folder-pick overlay: mounts the gea picker view, drives the directory
// listing and keyboard navigation, and resolves the caller's promise with the
// chosen path (or null). The reactive DOM lives in FolderPickerView / FolderList
// reading folder.store; these methods own the async load, selection index, and
// resolve/settle logic and push it into the store, which is why they live here
// rather than in the stateless folder.state.
export class FolderPickerController {
  private readonly startDir?: string
  private readonly resolve: (val: string | null) => void

  private readonly overlay: HTMLElement
  private readonly modal: HTMLElement
  private readonly close: () => void

  private settled = false
  private parent: string | null = null

  constructor(startDir: string | undefined, resolve: (val: string | null) => void) {
    this.startDir = startDir
    this.resolve = resolve

    const { overlay, modal, close } = overlayModal('picker-modal')
    this.overlay = overlay
    this.modal = modal
    this.close = close
    store.reset()

    const deps: FolderPickerDeps = {
      placeholder: UITexts.Pickers.folder.pickPlaceholder,
      showUse: true,
      onUse: () => this.finish(store.path),
      onSelect: (d) => this.finish(d.path),
      onDrill: (d) => void this.load(d.path),
      onHover: (i) => store.setSel(i),
      onKeyDown: this.onKey
    }
    new FolderPickerView(deps).render(modal)

    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.finish(null)
    })
  }

  open(): void {
    void this.load(this.startDir ?? (settings.codeRoot || undefined))
    ;(this.modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
  }

  private finish = (val: string | null): void => {
    if (this.settled) return
    this.settled = true
    this.close()
    this.resolve(val)
  }

  private filtered = (): DirEntry[] => filterDirs(store.dirs, store.search)

  private load = async (p?: string): Promise<void> => {
    const listing = await dirService.list(p)
    this.parent = listing.parent
    store.setListing(listing.path, listing.dirs)
  }

  private onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    const items = this.filtered()
    if (e.key === 'Escape') this.finish(null)
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      store.setSel(Math.min(items.length - 1, store.sel + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      store.setSel(Math.max(0, store.sel - 1))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (items[store.sel]) void this.load(items[store.sel].path)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (this.parent) void this.load(this.parent)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[store.sel]) this.finish(items[store.sel].path)
    }
  }
}

// ---- Cmd+P: browse folders from the code root, open one in a new terminal ----
// Owns the folder-browse overlay: mounts the gea picker view, drives the directory
// listing and keyboard navigation. Selecting a folder opens it in a new terminal.
// The reactive DOM lives in FolderPickerView / FolderList reading folder.store;
// these methods own the async load + selection index and push it into the store.
export class FolderDashboardController {
  private readonly modal: HTMLElement
  private readonly close: () => void
  private readonly openHere: (p: string) => void

  private parent: string | null = null

  constructor() {
    const { modal, close } = overlayModal('picker-modal')
    this.modal = modal
    this.close = close
    this.openHere = makeOpenHere(close)
    store.reset()

    const deps: FolderPickerDeps = {
      placeholder: UITexts.Pickers.folder.openPlaceholder,
      showUse: false,
      onUse: () => {},
      onSelect: (d) => this.openHere(d.path),
      onDrill: (d) => void this.load(d.path),
      onHover: (i) => store.setSel(i),
      onKeyDown: this.onKey
    }
    new FolderPickerView(deps).render(modal)
  }

  async open(): Promise<void> {
    await this.load(settings.codeRoot || undefined)
    ;(this.modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
  }

  private filtered = (): DirEntry[] => filterDirs(store.dirs, store.search)

  private load = async (p?: string): Promise<void> => {
    const listing = await dirService.list(p)
    this.parent = listing.parent
    store.setListing(listing.path, listing.dirs)
  }

  private onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    const items = this.filtered()
    if (e.key === 'Escape') this.close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      store.setSel(Math.min(items.length - 1, store.sel + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      store.setSel(Math.max(0, store.sel - 1))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (items[store.sel]) void this.load(items[store.sel].path)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (this.parent) void this.load(this.parent)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[store.sel]) this.openHere(items[store.sel].path)
    }
  }
}
