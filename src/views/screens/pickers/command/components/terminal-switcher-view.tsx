import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { OpenTerminal } from '../command.types'
import { filterTerminals } from '../command.store'
import { terminalSwitcherStore as store } from '../command.store'
import TerminalRow from './terminal-row'

// The behaviour the switcher view needs, supplied by the controller: keyboard nav,
// selecting a terminal, and hover-to-highlight. The handlers close over the
// controller's close/selectPane logic and the selection index it pushes to the store.
export interface TerminalSwitcherDeps {
  onKeyDown: (e: KeyboardEvent) => void
  onSelect: (terminal: OpenTerminal) => void
  onHover: (index: number) => void
}

// Reactive body of the terminal switcher: heading, search box, and the live-filtered
// terminal list. Rendered as a JSX child of TerminalSwitcherView so gea tracks its
// store reads and re-renders on every keystroke / arrow-key move — the board pattern.
// A top-level, imperatively mounted component does not re-subscribe on store writes,
// so all reactive markup lives here.
class TerminalSwitcherList extends Component {
  declare props: { deps: TerminalSwitcherDeps }

  template({ deps }: this['props']) {
    const all = store.all
    const sel = store.sel
    const items = filterTerminals(all, store.search)

    return (
      <div>
        <h2>{UITexts.Pickers.command.terminalsHeading}</h2>
        <input
          class="search-box-input"
          type="text"
          spellcheck="false"
          placeholder={UITexts.Pickers.command.terminalsPlaceholder}
          value={store.search}
          onInput={(e: Event) => store.setSearch((e.target as HTMLInputElement).value)}
          onKeyDown={deps.onKeyDown}
        />
        <div class="pick-list picker-list">
          {items.map((t, i) => (
            <TerminalRow
              key={t.paneId}
              terminal={t}
              active={i === sel}
              onClick={() => deps.onSelect(t)}
              onHover={() => deps.onHover(i)}
            />
          ))}
          {items.length === 0 && (
            <div class="empty-hint">
              {all.length ? UITexts.Pickers.common.noMatches : UITexts.Pickers.command.noTerminals}
            </div>
          )}
        </div>
      </div>
    )
  }
}

// Thin shell for the terminal switcher, mounted imperatively into the shared overlay
// modal. `deps` arrive via the constructor into a plain field — a gea Component only
// populates `this.props` when rendered from a parent template. The reactive markup
// lives in the TerminalSwitcherList JSX child.
export default class TerminalSwitcherView extends Component {
  private readonly deps: TerminalSwitcherDeps

  constructor(deps: TerminalSwitcherDeps) {
    super()
    this.deps = deps
  }

  template() {
    return <TerminalSwitcherList deps={this.deps} />
  }
}
