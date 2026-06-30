import { el } from '@views/lib/dom'
import { UITexts } from '@texts'
import type { FileSearchHandle, FileSearchOptions } from './file-search.types'
import { filterFiles, disableSpellcheck, makeItemPick, makeSearchKeydown } from './file-search.state'
import { createSearchItem } from './search-item'

// Searchable file-list dropdown for the diff pane. Filters the diff's files by a
// substring of their path and jumps to the picked file. Pure — the file list,
// the active index, and the pick handler are injected, so it renders and filters
// in isolation. The constructor builds + wires the DOM; build() returns the handle.
// Plain-DOM (el()) port of the legacy JSX controller (§2.7 self-contained, no @ui).
export class FileSearchController {
  private readonly opts: FileSearchOptions
  private readonly input: HTMLInputElement
  private readonly list: HTMLDivElement
  private readonly el: HTMLDivElement

  constructor(opts: FileSearchOptions) {
    this.opts = opts
    this.input = el('input', { class: 'diff-search-input', placeholder: UITexts.DiffPane.filterFiles })
    disableSpellcheck(this.input)
    this.list = el('div', { class: 'diff-search-list' })
    this.el = el('div', { class: 'diff-search' }, this.input, this.list)
    this.el.style.display = 'none'

    this.input.addEventListener('input', this.renderList)
    this.input.addEventListener('keydown', makeSearchKeydown(this.input, this.opts.getFiles, this.close, this.opts.onPick))
  }

  build(): FileSearchHandle {
    return { el: this.el, open: this.open, close: this.close, toggle: this.toggle, isOpen: this.isOpen }
  }

  private isOpen = (): boolean => this.el.style.display !== 'none'

  private renderList = (): void => {
    this.list.replaceChildren()
    const matches = filterFiles(this.opts.getFiles(), this.input.value)
    const activeIdx = this.opts.getActiveIdx()
    for (const { f, i } of matches.slice(0, 200)) {
      this.list.appendChild(
        createSearchItem({ file: f, active: i === activeIdx, onPick: makeItemPick(i, this.close, this.opts.onPick) })
      )
    }
    if (!matches.length) {
      this.list.appendChild(el('div', { class: 'diff-search-empty' }, UITexts.DiffPane.noMatchingFiles))
    }
  }

  private open = (): void => {
    this.el.style.display = ''
    this.input.value = ''
    this.renderList()
    this.input.focus()
  }

  private close = (): void => {
    this.el.style.display = 'none'
  }

  private toggle = (): void => {
    if (this.isOpen()) this.close()
    else this.open()
  }
}
