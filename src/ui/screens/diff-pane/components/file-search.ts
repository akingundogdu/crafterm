// Searchable file-list dropdown for the diff pane. Filters the diff's files by a
// substring of their path and jumps to the picked file. Pure — the file list,
// the active index, and the pick handler are injected, so it renders and filters
// in isolation.

import type { FileDiff } from '../parse-diff'

export interface FileSearchHandle {
  el: HTMLDivElement
  open: () => void
  close: () => void
  toggle: () => void
  isOpen: () => boolean
}

export function createFileSearch(opts: {
  getFiles: () => FileDiff[]
  getActiveIdx: () => number
  onPick: (idx: number) => void
}): FileSearchHandle {
  const el = document.createElement('div')
  el.className = 'diff-search'
  el.style.display = 'none'
  const input = document.createElement('input')
  input.className = 'diff-search-input'
  input.placeholder = 'Filter files…'
  input.spellcheck = false
  const list = document.createElement('div')
  list.className = 'diff-search-list'
  el.append(input, list)

  const isOpen = (): boolean => el.style.display !== 'none'

  const renderList = (): void => {
    const q = input.value.trim().toLowerCase()
    list.replaceChildren()
    const matches = opts
      .getFiles()
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => !q || f.path.toLowerCase().includes(q))
    const activeIdx = opts.getActiveIdx()
    for (const { f, i } of matches.slice(0, 200)) {
      const item = document.createElement('div')
      item.className = 'diff-search-item' + (i === activeIdx ? ' active' : '')
      item.textContent = f.path
      item.title = f.path
      item.addEventListener('mousedown', (e) => {
        e.preventDefault()
        close()
        opts.onPick(i)
      })
      list.appendChild(item)
    }
    if (!matches.length) {
      const empty = document.createElement('div')
      empty.className = 'diff-search-empty'
      empty.textContent = 'No matching files'
      list.appendChild(empty)
    }
  }

  const open = (): void => {
    el.style.display = ''
    input.value = ''
    renderList()
    input.focus()
  }
  function close(): void {
    el.style.display = 'none'
  }
  const toggle = (): void => {
    if (isOpen()) close()
    else open()
  }

  input.addEventListener('input', renderList)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close()
      return
    }
    if (e.key === 'Enter') {
      const q = input.value.trim().toLowerCase()
      const first = opts.getFiles().findIndex((f) => !q || f.path.toLowerCase().includes(q))
      if (first >= 0) {
        close()
        opts.onPick(first)
      }
    }
  })

  return { el, open, close, toggle, isOpen }
}
