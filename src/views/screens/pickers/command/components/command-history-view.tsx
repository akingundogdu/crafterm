import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import { filterHistory } from '../command.state'
import { commandHistoryStore as store } from '../command.store'
import CommandHistoryRow from './command-history-row'

// The behaviour the history view needs, supplied by the controller: Escape closes.
export interface CommandHistoryDeps {
  onKeyDown: (e: KeyboardEvent) => void
}

// Reactive body of the command history picker: heading, filter box, and the
// live-filtered command list (capped at 500). Rendered as a JSX child of
// CommandHistoryView so gea tracks its store reads and re-renders on every keystroke
// — the board pattern.
class CommandHistoryList extends Component {
  declare props: { deps: CommandHistoryDeps }

  template({ deps }: this['props']) {
    const all = store.all
    const items = filterHistory(all, store.search).slice(0, 500)

    return (
      <div>
        <h2>{UITexts.Pickers.command.historyHeading}</h2>
        <input
          class="search-box-input"
          type="text"
          spellcheck="false"
          placeholder={UITexts.Pickers.command.filterPlaceholder}
          value={store.search}
          onInput={(e: Event) => store.setSearch((e.target as HTMLInputElement).value)}
          onKeyDown={deps.onKeyDown}
        />
        <div class="pick-list picker-list">
          {items.map((cmd, i) => (
            <CommandHistoryRow key={`${i}:${cmd}`} command={cmd} />
          ))}
          {items.length === 0 && (
            <div class="empty-hint">
              {all.length ? UITexts.Pickers.common.noMatches : UITexts.Pickers.command.noCommands}
            </div>
          )}
        </div>
      </div>
    )
  }
}

// Thin shell for the command history picker, mounted imperatively into the shared
// overlay modal. `deps` arrive via the constructor into a plain field. The reactive
// markup lives in the CommandHistoryList JSX child.
export default class CommandHistoryView extends Component {
  private readonly deps: CommandHistoryDeps

  constructor(deps: CommandHistoryDeps) {
    super()
    this.deps = deps
  }

  template() {
    return <CommandHistoryList deps={this.deps} />
  }
}
