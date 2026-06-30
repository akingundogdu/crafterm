import { el } from '@views/lib/dom'
import type { DirEntry } from '@services/fs/fs.types'
import { settings } from '@views/state/spine'
import { dirService } from '@services'
import { overlayModal } from '../shared'
import { UITexts } from '@texts'
import { filterDirs, makeOpenHere } from './folder.state'
import { folderRow } from './components/folder-row'

// Owns the folder-pick overlay: builds the modal, drives the directory listing
// and keyboard navigation, and resolves the caller's promise with the chosen
// path (or null). All methods close over this instance's selection + listing
// state, which is why they live here rather than in the stateless folder.state.
export class FolderPickerController {
  private readonly startDir?: string
  private readonly resolve: (val: string | null) => void

  private readonly overlay: HTMLElement
  private readonly close: () => void
  private readonly path: HTMLDivElement
  private readonly input: HTMLInputElement
  private readonly list: HTMLDivElement

  private settled = false
  private dirs: DirEntry[] = []
  private parent: string | null = null
  private current = ''
  private sel = 0

  constructor(startDir: string | undefined, resolve: (val: string | null) => void) {
    this.startDir = startDir
    this.resolve = resolve

    const { overlay, modal, close } = overlayModal('picker-modal')
    this.overlay = overlay
    this.close = close

    this.path = el('div', { class: 'picker-path' })
    const useBtn = el(
      'button',
      { class: 'settings-inline-btn', onClick: () => this.finish(this.current) },
      'Use this folder'
    )
    this.input = el('input', {
      class: 'search-box-input',
      type: 'text',
      placeholder: UITexts.Pickers.folder.pickPlaceholder
    })
    this.input.spellcheck = false
    this.list = el('div', { class: 'pick-list picker-list' })
    modal.append(this.path, useBtn, this.input, this.list)

    this.wireEvents()
  }

  open(): void {
    void this.load(this.startDir ?? (settings.codeRoot || undefined))
    this.input.focus()
  }

  private finish = (val: string | null): void => {
    if (this.settled) return
    this.settled = true
    this.close()
    this.resolve(val)
  }

  private filtered = (): DirEntry[] => filterDirs(this.dirs, this.input.value)

  private highlight = (): void => {
    this.list.querySelectorAll<HTMLElement>('.picker-row').forEach((el, i) => {
      el.classList.toggle('active', i === this.sel)
    })
  }

  private renderList = (): void => {
    const items = this.filtered()
    if (this.sel >= items.length) this.sel = Math.max(0, items.length - 1)
    this.list.replaceChildren()
    if (!items.length) {
      this.list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No folders</div>')
      return
    }
    items.forEach((d, i) => {
      this.list.appendChild(
        folderRow({
          name: d.name,
          isActive: i === this.sel,
          onSelect: () => this.finish(d.path),
          onDrill: () => void this.load(d.path),
          onHover: () => {
            this.sel = i
            this.highlight()
          }
        })
      )
    })
  }

  private load = async (p?: string): Promise<void> => {
    const listing = await dirService.list(p)
    this.dirs = listing.dirs
    this.parent = listing.parent
    this.current = listing.path
    this.sel = 0
    this.path.textContent = listing.path
    this.input.value = ''
    this.renderList()
  }

  private wireEvents = (): void => {
    this.overlay.addEventListener('mousedown', (e) => {
      if (e.target === this.overlay) this.finish(null)
    })
    this.input.addEventListener('input', () => {
      this.sel = 0
      this.renderList()
    })
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      const items = this.filtered()
      if (e.key === 'Escape') this.finish(null)
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        this.sel = Math.min(items.length - 1, this.sel + 1)
        this.highlight()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        this.sel = Math.max(0, this.sel - 1)
        this.highlight()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (items[this.sel]) void this.load(items[this.sel].path)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (this.parent) void this.load(this.parent)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (items[this.sel]) this.finish(items[this.sel].path)
      }
    })
  }
}

// ---- Cmd+P: browse folders from the code root, open one in a new terminal ----
// Owns the folder-browse overlay: builds the modal, drives the directory listing
// and keyboard navigation. Selecting a folder opens it in a new terminal. All
// methods close over this instance's listing + selection state.
export class FolderDashboardController {
  private readonly close: () => void
  private readonly path: HTMLDivElement
  private readonly input: HTMLInputElement
  private readonly list: HTMLDivElement
  private readonly openHere: (p: string) => void

  private dirs: DirEntry[] = []
  private parent: string | null = null
  private sel = 0

  constructor() {
    const { modal, close } = overlayModal('picker-modal')
    this.close = close
    this.openHere = makeOpenHere(close)

    this.path = el('div', { class: 'picker-path' })
    this.input = el('input', {
      class: 'search-box-input',
      type: 'text',
      placeholder: UITexts.Pickers.folder.openPlaceholder
    })
    this.input.spellcheck = false
    this.list = el('div', { class: 'pick-list picker-list' })
    modal.append(this.path, this.input, this.list)

    this.input.addEventListener('input', () => {
      this.sel = 0
      this.renderList()
    })
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      const items = this.filtered()
      if (e.key === 'Escape') this.close()
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        this.sel = Math.min(items.length - 1, this.sel + 1)
        this.highlight()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        this.sel = Math.max(0, this.sel - 1)
        this.highlight()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (items[this.sel]) void this.load(items[this.sel].path)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (this.parent) void this.load(this.parent)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (items[this.sel]) this.openHere(items[this.sel].path)
      }
    })
  }

  async open(): Promise<void> {
    await this.load(settings.codeRoot || undefined)
    this.input.focus()
  }

  private filtered = (): DirEntry[] => filterDirs(this.dirs, this.input.value)

  private highlight = (): void => {
    this.list.querySelectorAll<HTMLElement>('.picker-row').forEach((el, i) => {
      el.classList.toggle('active', i === this.sel)
    })
  }

  private renderList = (): void => {
    const items = this.filtered()
    if (this.sel >= items.length) this.sel = Math.max(0, items.length - 1)
    this.list.replaceChildren()
    if (!items.length) {
      const hint = el('div', { class: 'empty-hint' }, 'No folders')
      this.list.appendChild(hint)
      return
    }
    items.forEach((d, i) => {
      this.list.appendChild(
        folderRow({
          name: d.name,
          isActive: i === this.sel,
          onSelect: () => this.openHere(d.path),
          onDrill: () => void this.load(d.path),
          onHover: () => {
            this.sel = i
            this.highlight()
          }
        })
      )
    })
  }

  private load = async (p?: string): Promise<void> => {
    const listing = await dirService.list(p)
    this.dirs = listing.dirs
    this.parent = listing.parent
    this.sel = 0
    this.path.textContent = listing.path
    this.input.value = ''
    this.renderList()
  }
}
