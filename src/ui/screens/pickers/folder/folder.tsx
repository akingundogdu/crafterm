import type { DirEntry } from '@services/fs/fs.types'
import { settings } from '@ui/state/state'
import { dirService } from '@services'
import { overlayModal } from '../shared'
import { UITexts } from '@texts'
import { filterDirs, makeOpenHere } from './folder.state'
import { folderRow } from './components/folder-row'

// ---- Pick a folder (returns its path) — used by Settings to choose md folders ----
export function pickFolderPath(startDir?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const { overlay, modal, close } = overlayModal('picker-modal')

    let settled = false
    const finish = (val: string | null): void => {
      if (settled) return
      settled = true
      close()
      resolve(val)
    }

    const path = (<div class="picker-path" />) as HTMLDivElement
    const useBtn = (<button class="settings-inline-btn">Use this folder</button>) as HTMLButtonElement
    const input = (
      <input
        class="search-box-input"
        type="text"
        placeholder={UITexts.Pickers.folder.pickPlaceholder}
        ref={(el: HTMLInputElement) => {
          el.spellcheck = false
        }}
      />
    ) as HTMLInputElement
    const list = (<div class="pick-list picker-list" />) as HTMLDivElement
    modal.append(path, useBtn, input, list)

    let dirs: DirEntry[] = []
    let parent: string | null = null
    let current = ''
    let sel = 0

    const filtered = (): DirEntry[] => filterDirs(dirs, input.value)
    const highlight = (): void => {
      list.querySelectorAll<HTMLElement>('.picker-row').forEach((el, i) => {
        el.classList.toggle('active', i === sel)
      })
    }
    const renderList = (): void => {
      const items = filtered()
      if (sel >= items.length) sel = Math.max(0, items.length - 1)
      list.replaceChildren()
      if (!items.length) {
        list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No folders</div>')
        return
      }
      items.forEach((d, i) => {
        list.appendChild(
          folderRow({
            name: d.name,
            isActive: i === sel,
            onSelect: () => finish(d.path),
            onDrill: () => void load(d.path),
            onHover: () => {
              sel = i
              highlight()
            }
          })
        )
      })
    }
    const load = async (p?: string): Promise<void> => {
      const listing = await dirService.list(p)
      dirs = listing.dirs
      parent = listing.parent
      current = listing.path
      sel = 0
      path.textContent = listing.path
      input.value = ''
      renderList()
    }

    useBtn.addEventListener('click', () => finish(current))
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) finish(null)
    })
    input.addEventListener('input', () => {
      sel = 0
      renderList()
    })
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      const items = filtered()
      if (e.key === 'Escape') finish(null)
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        sel = Math.min(items.length - 1, sel + 1)
        highlight()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        sel = Math.max(0, sel - 1)
        highlight()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (items[sel]) void load(items[sel].path)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (parent) void load(parent)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (items[sel]) finish(items[sel].path)
      }
    })

    void load(startDir ?? (settings.codeRoot || undefined))
    input.focus()
  })
}

// ---- Cmd+P: browse folders from the code root, open one in a new terminal ----
export async function showFolderPicker(): Promise<void> {
  const { modal, close } = overlayModal('picker-modal')

  const path = (<div class="picker-path" />) as HTMLDivElement
  const input = (
    <input
      class="search-box-input"
      type="text"
      placeholder={UITexts.Pickers.folder.openPlaceholder}
      ref={(el: HTMLInputElement) => {
        el.spellcheck = false
      }}
    />
  ) as HTMLInputElement
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  modal.append(path, input, list)

  let dirs: DirEntry[] = []
  let parent: string | null = null
  let sel = 0

  const filtered = (): DirEntry[] => filterDirs(dirs, input.value)

  const renderList = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    list.replaceChildren()
    if (!items.length) {
      const hint = (<div class="empty-hint">No folders</div>) as HTMLDivElement
      list.appendChild(hint)
      return
    }
    items.forEach((d, i) => {
      list.appendChild(
        folderRow({
          name: d.name,
          isActive: i === sel,
          onSelect: () => openHere(d.path),
          onDrill: () => void load(d.path),
          onHover: () => {
            sel = i
            highlight()
          }
        })
      )
    })
  }

  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.picker-row').forEach((el, i) => {
      el.classList.toggle('active', i === sel)
    })
  }

  const openHere = makeOpenHere(close)

  const load = async (p?: string): Promise<void> => {
    const listing = await dirService.list(p)
    dirs = listing.dirs
    parent = listing.parent
    sel = 0
    path.textContent = listing.path
    input.value = ''
    renderList()
  }

  input.addEventListener('input', () => {
    sel = 0
    renderList()
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
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (items[sel]) void load(items[sel].path)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (parent) void load(parent)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[sel]) openHere(items[sel].path)
    }
  })

  await load(settings.codeRoot || undefined)
  input.focus()
}
