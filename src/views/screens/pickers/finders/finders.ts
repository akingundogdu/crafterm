import { settings } from '@views/state/spine'
import { openMarkdownFile } from '@views/commands/commands'
import { overlayModal } from '../shared'
import { UITexts } from '@texts'
import type { MdFile } from './finders.types'
import { ALL_FOLDERS, loadMarkdown, loadFiles } from './finders.state'
import store from './finders.store'
import FindersPicker, { type FindersConfig } from './finders.picker'

export type { MdFile, FileFinderOptions } from './finders.types'

// The picker DOM lives in the gea FindersPicker reading finders.store; each entry
// owns the overlay modal and delegates the async folder loading to finders.state,
// pushing results into the shared store the reactive view patches on (no separate
// controller). Public entry signatures are unchanged.

// ---- All markdown finder (Cmd+O in Notebook): files under the configured folders ----

export async function showAllMarkdown(): Promise<void> {
  const folders = settings.commands.mdFolders
  store.reset()
  const { modal, close } = overlayModal('picker-modal')

  const open = (p: string): void => {
    openMarkdownFile(p)
    close()
  }

  const config: FindersConfig = {
    heading: UITexts.Pickers.finders.mdHeading,
    searchPlaceholder: UITexts.Pickers.finders.searchPlaceholder,
    emptyIdleHint: 'Pick a folder above to list its notes.',
    folders,
    onFilter: (value) => void loadMarkdown(folders, value),
    onChoose: (f) => open(f.path),
    close
  }
  new FindersPicker({ config }).render(modal)
  ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
}

// ---- Generic file finder (Notebook "Link file"): any file under the folders ----

// In-app fuzzy file search across the configured md folders. `onPick` receives
// the chosen file (used by the notebook to link external files into its tree).
export async function showFileFinder(opts: {
  title: string
  onPick: (path: string, name: string) => void
}): Promise<void> {
  const folders = settings.commands.mdFolders
  store.reset()
  const { modal, close } = overlayModal('picker-modal')

  const pick = (f: MdFile): void => {
    opts.onPick(f.path, f.name)
    close()
  }

  const config: FindersConfig = {
    heading: opts.title,
    searchPlaceholder: 'Search file by name',
    emptyIdleHint: 'Pick a folder above to list its files.',
    folders,
    onFilter: (value) => void loadFiles(folders, value),
    onChoose: (f) => pick(f),
    close
  }
  new FindersPicker({ config }).render(modal)
  // auto-load the "All" set so the search box is usable immediately
  if (folders.length) void loadFiles(folders, ALL_FOLDERS)
  ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
}
