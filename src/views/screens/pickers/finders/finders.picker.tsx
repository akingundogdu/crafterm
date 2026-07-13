import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { MdFile } from './finders.types'
import { filterByName, fileCountLabel } from './finders.store'
import store from './finders.store'
import FilterChips from './components/filter-chips'
import MdFileRow from './components/md-file-row'

// Config handed to the picker by the controller that owns the async loading and the
// choose action. The two finders differ only in copy + what a load fetches and what
// a pick does; the reactive markup is shared.
export interface FindersConfig {
  heading: string
  searchPlaceholder: string
  emptyIdleHint: string
  folders: string[]
  onFilter: (value: string) => void
  onChoose: (file: MdFile) => void
  close: () => void
}

// Reactive body of the finder pickers: heading, search box, filter chips, count and
// the live-filtered file list. Rendered as a JSX child of FindersPicker so gea
// tracks its store reads and re-renders it on every keystroke / chip click /
// selection move / load — the board pattern. A top-level, imperatively mounted
// component (FindersPicker) does not re-subscribe on store writes, so all reactive
// markup lives here.
class FindersList extends Component {
  declare props: { config: FindersConfig }

  template({ config }: this['props']) {
    // Subscribe to the reactive store fields so this child re-renders on any change.
    void store.rev
    const search = store.search
    const idle = store.folderFilter === null
    const items = idle ? [] : filterByName(store.files, search)
    const sel = Math.min(store.sel, Math.max(0, items.length - 1))
    const shown = store.loading ? [] : items.slice(0, 500)
    const countText = idle
      ? ''
      : store.loading
        ? UITexts.Pickers.finders.loading
        : fileCountLabel(items.length)
    const emptyHint = !config.folders.length
      ? UITexts.Pickers.finders.noFoldersConfigured
      : idle
        ? config.emptyIdleHint
        : UITexts.Pickers.finders.noMatches

    return (
      <div class="finders-picker">
        <h2>{config.heading}</h2>
        <input
          class="search-box-input"
          type="text"
          spellcheck="false"
          placeholder={config.searchPlaceholder}
          value={search}
          onInput={(e: Event) => {
            store.setSearch((e.target as HTMLInputElement).value)
            store.setSel(0)
          }}
          onKeyDown={(e: KeyboardEvent) => {
            e.stopPropagation()
            if (e.key === 'Escape') config.close()
            else if (e.key === 'ArrowDown') {
              e.preventDefault()
              store.setSel(Math.min(items.length - 1, sel + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              store.setSel(Math.max(0, sel - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const it = items[sel]
              if (it) config.onChoose(it)
            }
          }}
        />
        <FilterChips folders={config.folders} active={store.folderFilter} onPick={config.onFilter} />
        <div class="picker-markdown-count">{countText}</div>
        <div class="pick-list picker-list">
          {shown.map((f, i) => (
            <MdFileRow
              key={f.path}
              file={f}
              active={i === sel}
              onChoose={() => config.onChoose(f)}
              onHover={() => store.setSel(i)}
            />
          ))}
          {shown.length === 0 && !store.loading && <div class="empty-hint">{emptyHint}</div>}
        </div>
      </div>
    )
  }
}

// Thin shell for the finder pickers, mounted imperatively into the shared overlay
// modal by the controllers. Config arrives via the constructor into a plain field —
// a gea Component only populates `this.props` when rendered from a parent template,
// not from a manual `new X()`. The reactive markup lives in the FindersList child.
export default class FindersPicker extends Component {
  private readonly config: FindersConfig

  constructor(opts: { config: FindersConfig }) {
    super()
    this.config = opts.config
  }

  template() {
    return <FindersList config={this.config} />
  }
}
