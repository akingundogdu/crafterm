import { settings } from '@ui/state/state'
import { openMarkdownFile } from '@ui/commands/commands'
import { fsService, markdownService } from '@services'
import { overlayModal, makeSearchInput } from '../shared'
import { UITexts } from '@texts'
import type { MdFile } from './finders.types'
import { ALL_FOLDERS, filterByName, dedupeByPath, fileCountLabel } from './finders.state'
import { mdFileRow } from './components/md-file-row'
import { filterChips } from './components/filter-chips'

export type { MdFile, FileFinderOptions } from './finders.types'

// ---- All markdown finder (Cmd+O in Notebook): files under the configured folders ----

export async function showAllMarkdown(): Promise<void> {
  const folders = settings.commands.mdFolders
  const { modal, close } = overlayModal('picker-modal')

  const h = (<h2>{UITexts.Pickers.finders.mdHeading}</h2>) as HTMLHeadingElement
  const input = (<input class="search-box-input" type="text" placeholder={UITexts.Pickers.finders.searchPlaceholder} />) as HTMLInputElement
  input.spellcheck = false

  let folderFilter: string | null = null // null = nothing loaded yet
  let files: MdFile[] = []

  const { bar: filterBar, chips } = filterChips(folders, (value, chip) => void load(value, chip))

  const countEl = (<div class="picker-markdown-count" />) as HTMLDivElement
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(h, input, filterBar, countEl, list)

  let sel = 0

  // fetch markdown for the clicked folder — or, for "All", every configured folder
  const load = async (value: string, chip: HTMLButtonElement): Promise<void> => {
    folderFilter = value
    chips.forEach((x) => x.classList.toggle('active', x === chip))
    list.replaceChildren()
    countEl.textContent = UITexts.Pickers.finders.loading
    if (value === ALL_FOLDERS) {
      const results = await Promise.all(folders.map((f) => markdownService.findAll(f)))
      files = dedupeByPath(results.map((r) => r.files))
    } else {
      const res = await markdownService.findAll(value)
      files = res.files
    }
    sel = 0
    render()
  }

  const filtered = (): MdFile[] => (folderFilter === null ? [] : filterByName(files, input.value))
  const open = (p: string): void => {
    openMarkdownFile(p)
    close()
  }
  const render = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    const idle = folderFilter === null
    countEl.textContent = idle ? '' : fileCountLabel(items.length)
    list.replaceChildren()
    if (!items.length) {
      const hint = (
        <div class="empty-hint">
          {!folders.length
            ? UITexts.Pickers.finders.noFoldersConfigured
            : idle
              ? 'Pick a folder above to list its notes.'
              : UITexts.Pickers.finders.noMatches}
        </div>
      ) as HTMLDivElement
      list.appendChild(hint)
      return
    }
    items.slice(0, 500).forEach((f, i) => {
      list.appendChild(
        mdFileRow(
          f,
          i === sel,
          () => open(f.path),
          () => {
            sel = i
            highlight()
          }
        )
      )
    })
  }
  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.mdfile-row').forEach((el, i) => {
      el.classList.toggle('active', i === sel)
    })
  }
  input.addEventListener('input', () => {
    sel = 0
    render()
  })
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    const items = filtered()
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      sel = Math.min(items.length - 1, sel + 1)
      highlight()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      sel = Math.max(0, sel - 1)
      highlight()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[sel]) open(items[sel].path)
    }
  })
  render()
  input.focus()
}

// ---- Generic file finder (Notebook "Link file"): any file under the folders ----

// In-app fuzzy file search across the configured md folders. `onPick` receives
// the chosen file (used by the notebook to link external files into its tree).
export async function showFileFinder(opts: {
  title: string
  onPick: (path: string, name: string) => void
}): Promise<void> {
  const folders = settings.commands.mdFolders
  const { modal, close } = overlayModal('picker-modal')

  const h = (<h2>{opts.title}</h2>) as HTMLHeadingElement

  let folderFilter: string | null = null
  let files: MdFile[] = []

  const { bar: filterBar, chips } = filterChips(folders, (value, chip) => void load(value, chip))

  const countEl = (<div class="picker-markdown-count" />) as HTMLDivElement
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  const input = makeSearchInput('Search file by name', () => {
    sel = 0
    render()
  })
  modal.append(h, input, filterBar, countEl, list)

  let sel = 0

  const load = async (value: string, chip: HTMLButtonElement): Promise<void> => {
    folderFilter = value
    chips.forEach((x) => x.classList.toggle('active', x === chip))
    list.replaceChildren()
    countEl.textContent = UITexts.Pickers.finders.loading
    if (value === ALL_FOLDERS) {
      const results = await Promise.all(
        folders.map((f) => fsService.findFiles(f, settings.explorerExclude))
      )
      files = dedupeByPath(results.map((r) => r.files))
    } else {
      const res = await fsService.findFiles(value, settings.explorerExclude)
      files = res.files
    }
    sel = 0
    render()
  }

  const filtered = (): MdFile[] => (folderFilter === null ? [] : filterByName(files, input.value))
  const pick = (f: MdFile): void => {
    opts.onPick(f.path, f.name)
    close()
  }
  const render = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    const idle = folderFilter === null
    countEl.textContent = idle ? '' : fileCountLabel(items.length)
    list.replaceChildren()
    if (!items.length) {
      const hint = (
        <div class="empty-hint">
          {!folders.length
            ? UITexts.Pickers.finders.noFoldersConfigured
            : idle
              ? 'Pick a folder above to list its files.'
              : UITexts.Pickers.finders.noMatches}
        </div>
      ) as HTMLDivElement
      list.appendChild(hint)
      return
    }
    items.slice(0, 500).forEach((f, i) => {
      list.appendChild(
        mdFileRow(
          f,
          i === sel,
          () => pick(f),
          () => {
            sel = i
            highlight()
          }
        )
      )
    })
  }
  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.mdfile-row').forEach((el, i) => {
      el.classList.toggle('active', i === sel)
    })
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    const items = filtered()
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      sel = Math.min(items.length - 1, sel + 1)
      highlight()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      sel = Math.max(0, sel - 1)
      highlight()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[sel]) pick(items[sel])
    }
  })
  // auto-load the "All" set so the search box is usable immediately
  if (chips.length) void load(ALL_FOLDERS, chips[0])
  else render()
  input.focus()
}
