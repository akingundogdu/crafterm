import type { DirEntry } from '@bridge/api'
import { settings } from '../../../state'
import { openTerminalInDir } from '../../../commands'
import { fsService } from '../../../services/ipc'
import { overlayModal } from '../shared'

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

    const path = document.createElement('div')
    path.className = 'picker-path'
    const useBtn = document.createElement('button')
    useBtn.className = 'settings-inline-btn'
    useBtn.textContent = 'Use this folder'
    const input = document.createElement('input')
    input.className = 'search-box-input'
    input.type = 'text'
    input.placeholder = 'Filter folders…  (↑↓ move · → enter · ← up · ⏎ pick)'
    input.spellcheck = false
    const list = document.createElement('div')
    list.className = 'pick-list picker-list'
    modal.append(path, useBtn, input, list)

    let dirs: DirEntry[] = []
    let parent: string | null = null
    let current = ''
    let sel = 0

    const filtered = (): DirEntry[] => {
      const q = input.value.trim().toLowerCase()
      return q ? dirs.filter((d) => d.name.toLowerCase().includes(q)) : dirs
    }
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
        const row = document.createElement('div')
        row.className = 'pick-row picker-row' + (i === sel ? ' active' : '')
        const name = document.createElement('span')
        name.className = 'picker-name'
        name.textContent = d.name
        const drill = document.createElement('button')
        drill.className = 'picker-drill'
        drill.textContent = '›'
        drill.title = 'Enter folder'
        drill.addEventListener('click', (e) => {
          e.stopPropagation()
          void load(d.path)
        })
        row.append(name, drill)
        row.addEventListener('click', () => finish(d.path))
        row.addEventListener('mouseenter', () => {
          sel = i
          highlight()
        })
        list.appendChild(row)
      })
    }
    const load = async (p?: string): Promise<void> => {
      const listing = await fsService.listDir(p)
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

  const path = document.createElement('div')
  path.className = 'picker-path'
  const input = document.createElement('input')
  input.className = 'search-box-input'
  input.type = 'text'
  input.placeholder = 'Filter folders…  (↑↓ move · → enter · ← up · ⏎ open)'
  input.spellcheck = false
  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.append(path, input, list)

  let dirs: DirEntry[] = []
  let parent: string | null = null
  let sel = 0

  const filtered = (): DirEntry[] => {
    const q = input.value.trim().toLowerCase()
    return q ? dirs.filter((d) => d.name.toLowerCase().includes(q)) : dirs
  }

  const renderList = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    list.replaceChildren()
    if (!items.length) {
      const hint = document.createElement('div')
      hint.className = 'empty-hint'
      hint.textContent = 'No folders'
      list.appendChild(hint)
      return
    }
    items.forEach((d, i) => {
      const row = document.createElement('div')
      row.className = 'pick-row picker-row' + (i === sel ? ' active' : '')
      const name = document.createElement('span')
      name.className = 'picker-name'
      name.textContent = d.name
      const drill = document.createElement('button')
      drill.className = 'picker-drill'
      drill.textContent = '›'
      drill.title = 'Enter folder'
      drill.addEventListener('click', (e) => {
        e.stopPropagation()
        void load(d.path)
      })
      row.append(name, drill)
      row.addEventListener('click', () => openHere(d.path))
      row.addEventListener('mouseenter', () => {
        sel = i
        highlight()
      })
      list.appendChild(row)
    })
  }

  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.picker-row').forEach((el, i) => {
      el.classList.toggle('active', i === sel)
    })
  }

  const openHere = (dir: string): void => {
    void openTerminalInDir(dir)
    close()
  }

  const load = async (p?: string): Promise<void> => {
    const listing = await fsService.listDir(p)
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
