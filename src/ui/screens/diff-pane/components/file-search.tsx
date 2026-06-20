import { UITexts } from '@texts'
import type { FileSearchHandle, FileSearchOptions } from './file-search.types'
import { filterFiles, disableSpellcheck, makeItemPick, makeSearchKeydown } from './file-search.state'

export type { FileSearchHandle } from './file-search.types'

// Searchable file-list dropdown for the diff pane. Filters the diff's files by a
// substring of their path and jumps to the picked file. Pure — the file list,
// the active index, and the pick handler are injected, so it renders and filters
// in isolation.
export function createFileSearch(opts: FileSearchOptions): FileSearchHandle {
  const input = (
    <input
      class="diff-search-input"
      placeholder={UITexts.DiffPane.filterFiles}
      ref={disableSpellcheck}
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
    list.replaceChildren()
    const matches = filterFiles(opts.getFiles(), input.value)
    const activeIdx = opts.getActiveIdx()
    for (const { f, i } of matches.slice(0, 200)) {
      const item = (
        <div class={'diff-search-item' + (i === activeIdx ? ' active' : '')} title={f.path}>
          {f.path}
        </div>
      ) as HTMLDivElement
      item.addEventListener('mousedown', makeItemPick(i, close, opts.onPick))
      list.appendChild(item)
    }
    if (!matches.length) {
      list.appendChild(
        (<div class="diff-search-empty">{UITexts.DiffPane.noMatchingFiles}</div>) as HTMLDivElement
      )
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
  input.addEventListener('keydown', makeSearchKeydown(input, opts.getFiles, close, opts.onPick))

  return { el, open, close, toggle, isOpen }
}
