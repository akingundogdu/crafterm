import { settings } from '../../../state'
import { openMarkdownFile } from '../../../commands'
import { fsService } from '@services'
import { overlayModal, makeSearchInput, baseName } from '../shared'

// ---- All markdown finder (Cmd+O in Notebook): files under the configured folders ----

export async function showAllMarkdown(): Promise<void> {
  const folders = settings.commands.mdFolders
  const { modal, close } = overlayModal('picker-modal')

  const h = (<h2>Open markdown file</h2>) as HTMLHeadingElement
  const input = (<input class="search-box-input" type="text" placeholder="Search by file name" />) as HTMLInputElement
  input.spellcheck = false

  const ALL = ' all'
  let folderFilter: string | null = null // null = nothing loaded yet
  let files: { path: string; name: string }[] = []

  const filterBar = (<div class="md-filters" />) as HTMLDivElement
  const chips: HTMLButtonElement[] = []
  const makeChip = (label: string, value: string): void => {
    const c = (
      <button
        class="md-chip"
        title={value === ALL ? 'All configured folders' : value}
        onClick={() => void load(value, c)}
      >
        {label}
      </button>
    ) as HTMLButtonElement
    filterBar.appendChild(c)
    chips.push(c)
  }
  if (folders.length) {
    makeChip('All', ALL)
    folders.forEach((f) => makeChip(baseName(f), f))
  }

  const countEl = (<div class="md-count" />) as HTMLDivElement
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(h, input, filterBar, countEl, list)

  const pretty = (p: string): string => p.replace(/^\/Users\/[^/]+/, '~')
  let sel = 0

  // fetch markdown for the clicked folder — or, for "All", every configured folder
  const load = async (value: string, chip: HTMLButtonElement): Promise<void> => {
    folderFilter = value
    chips.forEach((x) => x.classList.toggle('active', x === chip))
    list.replaceChildren()
    countEl.textContent = 'Loading...'
    if (value === ALL) {
      const results = await Promise.all(folders.map((f) => fsService.findAllMarkdown(f)))
      const byPath = new Map<string, { path: string; name: string }>()
      results.forEach((r) => r.files.forEach((f) => byPath.set(f.path, f)))
      files = [...byPath.values()]
    } else {
      const res = await fsService.findAllMarkdown(value)
      files = res.files
    }
    sel = 0
    render()
  }

  const filtered = (): typeof files => {
    if (folderFilter === null) return []
    const q = input.value.trim().toLowerCase()
    return q ? files.filter((f) => f.name.toLowerCase().includes(q)) : files
  }
  const open = (p: string): void => {
    openMarkdownFile(p)
    close()
  }
  const render = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    const idle = folderFilter === null
    countEl.textContent = idle ? '' : `${items.length} file${items.length === 1 ? '' : 's'}`
    list.replaceChildren()
    if (!items.length) {
      const hint = (
        <div class="empty-hint">
          {!folders.length
            ? 'No folders configured. Add them in Settings → Commands.'
            : idle
              ? 'Pick a folder above to list its notes.'
              : 'No matches'}
        </div>
      ) as HTMLDivElement
      list.appendChild(hint)
      return
    }
    items.slice(0, 500).forEach((f, i) => {
      const row = (
        <div class={'pick-row mdfile-row' + (i === sel ? ' active' : '')}>
          <div class="claude-main">
            <span class="picker-name">{f.name}</span>
            <span class="project-sub">{pretty(f.path.slice(0, f.path.length - f.name.length))}</span>
          </div>
        </div>
      ) as HTMLDivElement
      row.addEventListener('click', () => open(f.path))
      row.addEventListener('mouseenter', () => {
        sel = i
        highlight()
      })
      list.appendChild(row)
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
  let files: { path: string; name: string }[] = []

  const ALL = ' all'
  const filterBar = (<div class="md-filters" />) as HTMLDivElement
  const chips: HTMLButtonElement[] = []
  const makeChip = (label: string, value: string): void => {
    const c = (
      <button
        class="md-chip"
        title={value === ALL ? 'All configured folders' : value}
        onClick={() => void load(value, c)}
      >
        {label}
      </button>
    ) as HTMLButtonElement
    filterBar.appendChild(c)
    chips.push(c)
  }
  if (folders.length) {
    makeChip('All', ALL)
    folders.forEach((f) => makeChip(baseName(f), f))
  }

  const countEl = (<div class="md-count" />) as HTMLDivElement
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  const input = makeSearchInput('Search file by name', () => {
    sel = 0
    render()
  })
  modal.append(h, input, filterBar, countEl, list)

  const pretty = (p: string): string => p.replace(/^\/Users\/[^/]+/, '~')
  let sel = 0

  const load = async (value: string, chip: HTMLButtonElement): Promise<void> => {
    folderFilter = value
    chips.forEach((x) => x.classList.toggle('active', x === chip))
    list.replaceChildren()
    countEl.textContent = 'Loading...'
    if (value === ALL) {
      const results = await Promise.all(
        folders.map((f) => fsService.findFiles(f, settings.explorerExclude))
      )
      const byPath = new Map<string, { path: string; name: string }>()
      results.forEach((r) => r.files.forEach((f) => byPath.set(f.path, f)))
      files = [...byPath.values()]
    } else {
      const res = await fsService.findFiles(value, settings.explorerExclude)
      files = res.files
    }
    sel = 0
    render()
  }

  const filtered = (): typeof files => {
    if (folderFilter === null) return []
    const q = input.value.trim().toLowerCase()
    return q ? files.filter((f) => f.name.toLowerCase().includes(q)) : files
  }
  const pick = (f: { path: string; name: string }): void => {
    opts.onPick(f.path, f.name)
    close()
  }
  const render = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    const idle = folderFilter === null
    countEl.textContent = idle ? '' : `${items.length} file${items.length === 1 ? '' : 's'}`
    list.replaceChildren()
    if (!items.length) {
      const hint = (
        <div class="empty-hint">
          {!folders.length
            ? 'No folders configured. Add them in Settings → Commands.'
            : idle
              ? 'Pick a folder above to list its files.'
              : 'No matches'}
        </div>
      ) as HTMLDivElement
      list.appendChild(hint)
      return
    }
    items.slice(0, 500).forEach((f, i) => {
      const row = (
        <div class={'pick-row mdfile-row' + (i === sel ? ' active' : '')}>
          <div class="claude-main">
            <span class="picker-name">{f.name}</span>
            <span class="project-sub">{pretty(f.path.slice(0, f.path.length - f.name.length))}</span>
          </div>
        </div>
      ) as HTMLDivElement
      row.addEventListener('click', () => pick(f))
      row.addEventListener('mouseenter', () => {
        sel = i
        highlight()
      })
      list.appendChild(row)
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
  if (chips.length) void load(ALL, chips[0])
  else render()
  input.focus()
}
