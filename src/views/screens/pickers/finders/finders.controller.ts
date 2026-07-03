import { settings } from '@views/state/spine'
import { openMarkdownFile } from '@views/commands/commands'
import { fsService, markdownService } from '@services'
import { overlayModal } from '../shared'
import { UITexts } from '@texts'
import type { MdFile, FileFinderOptions } from './finders.types'
import { ALL_FOLDERS, dedupeByPath } from './finders.state'
import store from './finders.store'
import FindersPicker from './finders.picker'
import type { FindersConfig } from './finders.picker'

// ---- All markdown finder (Cmd+O in Notebook): files under the configured folders ----
//
// The controllers own the overlay modal and the async folder loading; the reactive
// markup (search box, filter chips, count, list) lives in the gea FindersPicker,
// which they mount into the shared imperative overlay and drive through the shared
// finders store.

export class ShowAllMarkdownController {
  private readonly folders: string[]
  private readonly close: () => void
  private readonly modal: HTMLElement

  constructor() {
    this.folders = settings.commands.mdFolders
    store.reset()
    const { modal, close } = overlayModal('picker-modal')
    this.close = close
    this.modal = modal

    const config: FindersConfig = {
      heading: UITexts.Pickers.finders.mdHeading,
      searchPlaceholder: UITexts.Pickers.finders.searchPlaceholder,
      emptyIdleHint: 'Pick a folder above to list its notes.',
      folders: this.folders,
      onFilter: (value) => void this.load(value),
      onChoose: (f) => this.open(f.path),
      close
    }
    new FindersPicker({ config }).render(modal)
  }

  async run(): Promise<void> {
    ;(this.modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
  }

  // fetch markdown for the clicked folder — or, for "All", every configured folder
  private load = async (value: string): Promise<void> => {
    store.setFilter(value)
    store.setFiles([])
    store.setLoading(true)
    store.setSel(0)
    if (value === ALL_FOLDERS) {
      const results = await Promise.all(this.folders.map((f) => markdownService.findAll(f)))
      store.setFiles(dedupeByPath(results.map((r) => r.files)))
    } else {
      const res = await markdownService.findAll(value)
      store.setFiles(res.files)
    }
    store.setLoading(false)
    store.setSel(0)
  }

  private open = (p: string): void => {
    openMarkdownFile(p)
    this.close()
  }
}

// ---- Generic file finder (Notebook "Link file"): any file under the folders ----

// In-app fuzzy file search across the configured md folders. `onPick` receives the
// chosen file (used by the notebook to link external files into its tree).
export class ShowFileFinderController {
  private readonly opts: FileFinderOptions
  private readonly folders: string[]
  private readonly close: () => void
  private readonly modal: HTMLElement

  constructor(opts: FileFinderOptions) {
    this.opts = opts
    this.folders = settings.commands.mdFolders
    store.reset()
    const { modal, close } = overlayModal('picker-modal')
    this.close = close
    this.modal = modal

    const config: FindersConfig = {
      heading: opts.title,
      searchPlaceholder: 'Search file by name',
      emptyIdleHint: 'Pick a folder above to list its files.',
      folders: this.folders,
      onFilter: (value) => void this.load(value),
      onChoose: (f) => this.pick(f),
      close
    }
    new FindersPicker({ config }).render(modal)
  }

  async run(): Promise<void> {
    // auto-load the "All" set so the search box is usable immediately
    if (this.folders.length) void this.load(ALL_FOLDERS)
    ;(this.modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
  }

  private load = async (value: string): Promise<void> => {
    store.setFilter(value)
    store.setFiles([])
    store.setLoading(true)
    store.setSel(0)
    if (value === ALL_FOLDERS) {
      const results = await Promise.all(this.folders.map((f) => fsService.findFiles(f, settings.explorerExclude)))
      store.setFiles(dedupeByPath(results.map((r) => r.files)))
    } else {
      const res = await fsService.findFiles(value, settings.explorerExclude)
      store.setFiles(res.files)
    }
    store.setLoading(false)
    store.setSel(0)
  }

  private pick = (f: MdFile): void => {
    this.opts.onPick(f.path, f.name)
    this.close()
  }
}
