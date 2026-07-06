import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { FileSearchHandle, FileSearchOptions } from './file-search.types'
import { filterFiles, disableSpellcheck, makeItemPick, makeSearchKeydown } from './file-search.state'
import { createSearchItem } from './search-item'

// The search dropdown shell markup (input + results list), as a gea Component. The
// controller reads the two element refs and drives filtering/visibility.
class FileSearchShell extends Component {
  inputEl: HTMLInputElement | null = null
  listEl: HTMLDivElement | null = null

  template() {
    return (
      <div class="diff-search" style="display:none">
        <input class="diff-search-input" placeholder={UITexts.DiffPane.filterFiles} ref={this.inputEl} />
        <div class="diff-search-list" ref={this.listEl} />
      </div>
    )
  }
}

class SearchEmptyView extends Component {
  template() {
    return <div class="diff-search-empty">{UITexts.DiffPane.noMatchingFiles}</div>
  }
}

function createSearchEmpty(): HTMLDivElement {
  const host = document.createElement('div')
  new SearchEmptyView().render(host)
  return host.firstElementChild as HTMLDivElement
}

// Searchable file-list dropdown for the diff pane. Filters the diff's files by a
// substring of their path and jumps to the picked file. Pure — the file list,
// the active index, and the pick handler are injected, so it renders and filters
// in isolation. The constructor builds + wires the DOM; build() returns the handle.
export class FileSearchController {
  private readonly opts: FileSearchOptions
  private readonly input: HTMLInputElement
  private readonly list: HTMLDivElement
  private readonly el: HTMLDivElement

  constructor(opts: FileSearchOptions) {
    this.opts = opts
    const view = new FileSearchShell()
    const host = document.createElement('div')
    view.render(host)
    this.el = host.firstElementChild as HTMLDivElement
    this.input = view.inputEl as HTMLInputElement
    this.list = view.listEl as HTMLDivElement
    disableSpellcheck(this.input)

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
      this.list.appendChild(createSearchEmpty())
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
