import { settings } from '@views/state/spine'
import { openMarkdownFile } from '@views/commands/commands'
import { fsService, markdownService } from '@services'
import { el } from '@views/lib/dom'
import { overlayModal, makeSearchInput } from '../shared'
import { UITexts } from '@texts'
import type { MdFile, FileFinderOptions } from './finders.types'
import { ALL_FOLDERS, filterByName, dedupeByPath, fileCountLabel } from './finders.state'
import { mdFileRow } from './components/md-file-row'
import { filterChips } from './components/filter-chips'

// ---- All markdown finder (Cmd+O in Notebook): files under the configured folders ----

export class ShowAllMarkdownController {
  private readonly folders: string[]
  private readonly close: () => void
  private readonly input: HTMLInputElement
  private readonly chips: HTMLButtonElement[]
  private readonly countEl: HTMLDivElement
  private readonly list: HTMLDivElement

  private folderFilter: string | null = null // null = nothing loaded yet
  private files: MdFile[] = []
  private sel = 0

  constructor() {
    this.folders = settings.commands.mdFolders
    const { modal, close } = overlayModal('picker-modal')
    this.close = close

    const h = el('h2', null, UITexts.Pickers.finders.mdHeading)
    this.input = el('input', {
      class: 'search-box-input',
      type: 'text',
      placeholder: UITexts.Pickers.finders.searchPlaceholder
    })
    this.input.spellcheck = false

    const { bar: filterBar, chips } = filterChips(this.folders, (value, chip) => void this.load(value, chip))
    this.chips = chips

    this.countEl = el('div', { class: 'picker-markdown-count' })
    this.list = el('div', { class: 'pick-list picker-list' })
    modal.append(h, this.input, filterBar, this.countEl, this.list)

    this.input.addEventListener('input', () => {
      this.sel = 0
      this.render()
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
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (items[this.sel]) this.open(items[this.sel].path)
      }
    })
  }

  async run(): Promise<void> {
    this.render()
    this.input.focus()
  }

  // fetch markdown for the clicked folder — or, for "All", every configured folder
  private load = async (value: string, chip: HTMLButtonElement): Promise<void> => {
    this.folderFilter = value
    this.chips.forEach((x) => x.classList.toggle('active', x === chip))
    this.list.replaceChildren()
    this.countEl.textContent = UITexts.Pickers.finders.loading
    if (value === ALL_FOLDERS) {
      const results = await Promise.all(this.folders.map((f) => markdownService.findAll(f)))
      this.files = dedupeByPath(results.map((r) => r.files))
    } else {
      const res = await markdownService.findAll(value)
      this.files = res.files
    }
    this.sel = 0
    this.render()
  }

  private filtered = (): MdFile[] => (this.folderFilter === null ? [] : filterByName(this.files, this.input.value))

  private open = (p: string): void => {
    openMarkdownFile(p)
    this.close()
  }

  private render = (): void => {
    const items = this.filtered()
    if (this.sel >= items.length) this.sel = Math.max(0, items.length - 1)
    const idle = this.folderFilter === null
    this.countEl.textContent = idle ? '' : fileCountLabel(items.length)
    this.list.replaceChildren()
    if (!items.length) {
      const hint = el(
        'div',
        { class: 'empty-hint' },
        !this.folders.length
          ? UITexts.Pickers.finders.noFoldersConfigured
          : idle
            ? 'Pick a folder above to list its notes.'
            : UITexts.Pickers.finders.noMatches
      )
      this.list.appendChild(hint)
      return
    }
    items.slice(0, 500).forEach((f, i) => {
      this.list.appendChild(
        mdFileRow(
          f,
          i === this.sel,
          () => this.open(f.path),
          () => {
            this.sel = i
            this.highlight()
          }
        )
      )
    })
  }

  private highlight = (): void => {
    this.list.querySelectorAll<HTMLElement>('.mdfile-row').forEach((el, i) => {
      el.classList.toggle('active', i === this.sel)
    })
  }
}

// ---- Generic file finder (Notebook "Link file"): any file under the folders ----

// In-app fuzzy file search across the configured md folders. `onPick` receives
// the chosen file (used by the notebook to link external files into its tree).
export class ShowFileFinderController {
  private readonly opts: FileFinderOptions
  private readonly folders: string[]
  private readonly close: () => void
  private readonly input: HTMLInputElement
  private readonly chips: HTMLButtonElement[]
  private readonly countEl: HTMLDivElement
  private readonly list: HTMLDivElement

  private folderFilter: string | null = null
  private files: MdFile[] = []
  private sel = 0

  constructor(opts: FileFinderOptions) {
    this.opts = opts
    this.folders = settings.commands.mdFolders
    const { modal, close } = overlayModal('picker-modal')
    this.close = close

    const h = el('h2', null, opts.title)

    const { bar: filterBar, chips } = filterChips(this.folders, (value, chip) => void this.load(value, chip))
    this.chips = chips

    this.countEl = el('div', { class: 'picker-markdown-count' })
    this.list = el('div', { class: 'pick-list picker-list' })
    this.input = makeSearchInput('Search file by name', () => {
      this.sel = 0
      this.render()
    })
    modal.append(h, this.input, filterBar, this.countEl, this.list)

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
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (items[this.sel]) this.pick(items[this.sel])
      }
    })
  }

  async run(): Promise<void> {
    // auto-load the "All" set so the search box is usable immediately
    if (this.chips.length) void this.load(ALL_FOLDERS, this.chips[0])
    else this.render()
    this.input.focus()
  }

  private load = async (value: string, chip: HTMLButtonElement): Promise<void> => {
    this.folderFilter = value
    this.chips.forEach((x) => x.classList.toggle('active', x === chip))
    this.list.replaceChildren()
    this.countEl.textContent = UITexts.Pickers.finders.loading
    if (value === ALL_FOLDERS) {
      const results = await Promise.all(
        this.folders.map((f) => fsService.findFiles(f, settings.explorerExclude))
      )
      this.files = dedupeByPath(results.map((r) => r.files))
    } else {
      const res = await fsService.findFiles(value, settings.explorerExclude)
      this.files = res.files
    }
    this.sel = 0
    this.render()
  }

  private filtered = (): MdFile[] => (this.folderFilter === null ? [] : filterByName(this.files, this.input.value))

  private pick = (f: MdFile): void => {
    this.opts.onPick(f.path, f.name)
    this.close()
  }

  private render = (): void => {
    const items = this.filtered()
    if (this.sel >= items.length) this.sel = Math.max(0, items.length - 1)
    const idle = this.folderFilter === null
    this.countEl.textContent = idle ? '' : fileCountLabel(items.length)
    this.list.replaceChildren()
    if (!items.length) {
      const hint = el(
        'div',
        { class: 'empty-hint' },
        !this.folders.length
          ? UITexts.Pickers.finders.noFoldersConfigured
          : idle
            ? 'Pick a folder above to list its files.'
            : UITexts.Pickers.finders.noMatches
      )
      this.list.appendChild(hint)
      return
    }
    items.slice(0, 500).forEach((f, i) => {
      this.list.appendChild(
        mdFileRow(
          f,
          i === this.sel,
          () => this.pick(f),
          () => {
            this.sel = i
            this.highlight()
          }
        )
      )
    })
  }

  private highlight = (): void => {
    this.list.querySelectorAll<HTMLElement>('.mdfile-row').forEach((el, i) => {
      el.classList.toggle('active', i === this.sel)
    })
  }
}
