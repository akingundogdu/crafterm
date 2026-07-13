import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { GsEntry } from './global-search.types'
import { filterEntries } from './global-search.store'
import store from './global-search.store'
import GlobalSearchRow from './components/global-search-row'

interface GlobalSearchListProps {
  entries: GsEntry[]
  choose: (entry: GsEntry) => void
  close: () => void
}

// Reactive body of the global-search picker: heading, search box, and the
// live-filtered, keyboard-navigable result list. Rendered as a JSX child of
// GlobalSearchPicker so gea tracks its store reads (query / sel / rev) and
// re-renders it on every keystroke, arrow move, or hover — the board pattern. A
// top-level, imperatively mounted component (GlobalSearchPicker) does not
// re-subscribe on store writes, so all reactive markup lives here. `entries` is
// the async-built index, static after open; the reactive query + selection live
// in the store. Self-contained — no @ui.
class GlobalSearchList extends Component {
  declare props: GlobalSearchListProps

  private onInput = (e: Event): void => {
    store.setQuery((e.target as HTMLInputElement).value)
    store.setSel(0)
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    e.stopPropagation()
    const { entries, choose, close } = this.props
    const items = filterEntries(entries, store.query)
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      store.setSel(Math.min(items.length - 1, store.sel + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      store.setSel(Math.max(0, store.sel - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const picked = items[store.sel]
      if (picked) choose(picked)
    }
  }

  template({ entries, choose }: this['props']) {
    // Subscribe to the reactive store fields so this child re-renders on any search
    // keystroke (store.query), selection move (store.sel), or refresh (store.rev).
    void store.rev
    const query = store.query
    const items = filterEntries(entries, query)
    const sel = store.sel >= items.length ? Math.max(0, items.length - 1) : store.sel

    return (
      <div class="global-search-picker">
        <h2>{UITexts.Pickers.globalSearch.heading}</h2>
        <input
          class="search-box-input"
          type="text"
          spellcheck="false"
          placeholder={UITexts.Pickers.globalSearch.placeholder}
          value={query}
          onInput={this.onInput}
          onKeyDown={this.onKeyDown}
        />
        <div class="pick-list picker-list">
          {items.map((entry, i) => (
            <GlobalSearchRow
              key={`${entry.source}:${entry.label}:${entry.detail ?? ''}`}
              entry={entry}
              isActive={i === sel}
              onChoose={() => choose(entry)}
              onHover={() => store.setSel(i)}
            />
          ))}
          {items.length === 0 && <div class="empty-hint">No matches</div>}
        </div>
      </div>
    )
  }
}

// Thin shell for the global-search picker, mounted imperatively into the shared
// overlay modal by GlobalSearchController. Data (the async-built entry index, the
// row-activation opener, and the modal's close fn) arrives via the constructor
// into plain fields — a gea Component only populates `this.props` when rendered
// from a parent template, not from a manual `new X()`. The reactive markup lives
// in the GlobalSearchList JSX child.
export default class GlobalSearchPicker extends Component {
  private readonly entries: GsEntry[]
  private readonly choose: (entry: GsEntry) => void
  private readonly closeFn: () => void

  constructor(opts: { entries: GsEntry[]; choose: (entry: GsEntry) => void; close: () => void }) {
    super()
    this.entries = opts.entries
    this.choose = opts.choose
    this.closeFn = opts.close
  }

  template() {
    return <GlobalSearchList entries={this.entries} choose={this.choose} close={this.closeFn} />
  }
}
