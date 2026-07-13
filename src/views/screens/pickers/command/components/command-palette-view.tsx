import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { PaletteCommand } from '../command.types'
import { filterPaletteCommands } from '../command.store'
import { commandPaletteStore as store } from '../command.store'
import CategoryChip from './category-chips'
import PaletteRow from './palette-row'

// The behaviour the palette view needs, supplied by the controller: keyboard nav,
// inserting a command, hover-to-highlight, and toggling a category chip. The handlers
// close over the controller's insert/close logic and the state it pushes to the store.
export interface CommandPaletteDeps {
  onKeyDown: (e: KeyboardEvent) => void
  onSelect: (command: PaletteCommand) => void
  onHover: (index: number) => void
  onToggle: (category: string) => void
}

// Reactive body of the command palette: heading, search box, the category segmented
// control, and the live-filtered command list (capped at 500). Rendered as a JSX
// child of CommandPaletteView so gea tracks its store reads and re-renders on every
// keystroke / chip toggle / arrow-key move — the board pattern.
class CommandPaletteList extends Component {
  declare props: { deps: CommandPaletteDeps }

  template({ deps }: this['props']) {
    const categories = store.categories
    const active = store.active
    const sel = store.sel
    const items = filterPaletteCommands(store.all, active, store.search).slice(0, 500)

    return (
      <div>
        <h2>{UITexts.Pickers.command.heading}</h2>
        <input
          class="search-box-input"
          type="text"
          spellcheck="false"
          placeholder={UITexts.Pickers.command.placeholder}
          value={store.search}
          onInput={(e: Event) => store.setSearch((e.target as HTMLInputElement).value)}
          onKeyDown={deps.onKeyDown}
        />
        <div class="md-filters palette-chips">
          {categories.map((cat) => (
            <CategoryChip key={cat} category={cat} active={active.has(cat)} onToggle={deps.onToggle} />
          ))}
        </div>
        <div class="pick-list picker-list">
          {items.map((c, i) => (
            <PaletteRow
              key={`${c.category}:${c.name}:${c.value}`}
              command={c}
              active={i === sel}
              onClick={() => deps.onSelect(c)}
              onHover={() => deps.onHover(i)}
            />
          ))}
          {items.length === 0 && <div class="empty-hint">No matches</div>}
        </div>
      </div>
    )
  }
}

// Thin shell for the command palette, mounted imperatively into the shared overlay
// modal. `deps` arrive via the constructor into a plain field. The reactive markup
// lives in the CommandPaletteList JSX child.
export default class CommandPaletteView extends Component {
  private readonly deps: CommandPaletteDeps

  constructor(deps: CommandPaletteDeps) {
    super()
    this.deps = deps
  }

  template() {
    return <CommandPaletteList deps={this.deps} />
  }
}
