import { UITexts } from '@texts'
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
  const input = (
    <input
      class="diff-search-input"
      placeholder={UITexts.DiffPane.filterFiles}
      ref={(el: HTMLInputElement) => {
        // Set the property (not just the attribute) so it reflects on `.spellcheck`.
        el.spellcheck = false
      }}
    />
  ) as HTMLInputElement
  const list = (<div class="diff-search-list" />) as HTMLDivElement
  const el = (
    <div class="diff-search">
      {input}
      {list}
    </div>
  ) as HTMLDivElement
  el.style.display = 'none'

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
      const item = (
        <div class={'diff-search-item' + (i === activeIdx ? ' active' : '')} title={f.path}>
          {f.path}
        </div>
      ) as HTMLDivElement
      item.addEventListener('mousedown', (e) => {
        e.preventDefault()
        close()
        opts.onPick(i)
      })
      list.appendChild(item)
    }
    if (!matches.length) {
      const empty = (<div class="diff-search-empty">{UITexts.DiffPane.noMatchingFiles}</div>) as HTMLDivElement
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
