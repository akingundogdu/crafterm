import { commandHistory, state } from '@ui/state/state'
import { selectPane } from '@ui/commands/commands'
import { terminalService } from '@services'
import { overlayModal } from '../shared'
import { UITexts } from '@texts'
import type { OpenTerminal, PaletteCommand } from './command.types'
import {
  buildOpenTerminals,
  filterTerminals,
  filterHistory,
  loadZshCommands,
  buildPaletteCommands,
  filterPaletteCommands
} from './command.state'
import { terminalRow } from './components/terminal-row'
import { commandHistoryRow } from './components/command-history-row'
import { paletteRow } from './components/palette-row'
import { renderCategoryChips } from './components/category-chips'

// ---- Terminal switcher: list every open terminal/pane, search, jump to one ----

export class TerminalSwitcherController {
  private readonly close: () => void
  private readonly input: HTMLInputElement
  private readonly list: HTMLDivElement
  private readonly all: OpenTerminal[]
  private sel = 0

  constructor() {
    const { modal, close } = overlayModal('picker-modal picker-modal-wide')
    this.close = close

    const h = (<h2>{UITexts.Pickers.command.terminalsHeading}</h2>) as HTMLHeadingElement
    this.input = (
      <input class="search-box-input" type="text" placeholder={UITexts.Pickers.command.terminalsPlaceholder} />
    ) as HTMLInputElement
    this.input.spellcheck = false
    this.list = (<div class="pick-list picker-list" />) as HTMLDivElement
    modal.append(h, this.input, this.list)

    this.all = buildOpenTerminals()

    this.input.addEventListener('input', () => {
      this.sel = 0
      this.render()
    })
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      const items = this.filtered()
      if (e.key === 'Escape') this.close()
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        this.sel = Math.min(items.length - 1, this.sel + 1)
        this.highlight()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        this.sel = Math.max(0, this.sel - 1)
        this.highlight()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (items[this.sel]) this.focusTerm(items[this.sel])
      }
    })
  }

  open(): void {
    this.render()
    this.input.focus()
  }

  private filtered = (): OpenTerminal[] => filterTerminals(this.all, this.input.value)

  private focusTerm = (t: OpenTerminal): void => {
    selectPane(t.paneId)
    this.close()
  }

  private highlight = (): void => {
    this.list.querySelectorAll<HTMLElement>('.pick-row').forEach((el, i) => {
      el.classList.toggle('active', i === this.sel)
    })
  }

  private render = (): void => {
    const items = this.filtered()
    if (this.sel >= items.length) this.sel = Math.max(0, items.length - 1)
    this.list.replaceChildren()
    if (!items.length) {
      this.list.insertAdjacentHTML(
        'beforeend',
        `<div class="empty-hint">${this.all.length ? UITexts.Pickers.common.noMatches : UITexts.Pickers.command.noTerminals}</div>`
      )
      return
    }
    items.forEach((t, i) => {
      this.list.appendChild(
        terminalRow({
          terminal: t,
          active: i === this.sel,
          onClick: () => this.focusTerm(t),
          onHover: () => {
            this.sel = i
            this.highlight()
          }
        })
      )
    })
  }
}

// ---- Command history: filter all app-tracked commands, copy one ----

export class CommandHistoryController {
  private readonly close: () => void
  private readonly input: HTMLInputElement
  private readonly list: HTMLDivElement
  private readonly all: string[]

  constructor() {
    const { modal, close } = overlayModal('picker-modal')
    this.close = close

    const h = (<h2>{UITexts.Pickers.command.historyHeading}</h2>) as HTMLHeadingElement
    this.input = (
      <input class="search-box-input" type="text" placeholder={UITexts.Pickers.command.filterPlaceholder} />
    ) as HTMLInputElement
    this.input.spellcheck = false
    this.list = (<div class="pick-list picker-list" />) as HTMLDivElement
    modal.append(h, this.input, this.list)

    this.all = [...commandHistory].reverse() // most recent first

    this.input.addEventListener('input', this.render)
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') this.close()
    })
  }

  open(): void {
    this.render()
    this.input.focus()
  }

  private render = (): void => {
    const items = filterHistory(this.all, this.input.value)
    this.list.replaceChildren()
    if (!items.length) {
      const hint = (
        <div class="empty-hint">{commandHistory.length ? UITexts.Pickers.common.noMatches : UITexts.Pickers.command.noCommands}</div>
      ) as HTMLDivElement
      this.list.appendChild(hint)
      return
    }
    items.slice(0, 500).forEach((cmd) => {
      this.list.appendChild(commandHistoryRow({ command: cmd }))
    })
  }
}

// ---- Command palette: zsh + user categories (predefined / cheatsheets) ----

export class CommandPaletteController {
  private readonly close: () => void
  private readonly input: HTMLInputElement
  private readonly chips: HTMLDivElement
  private readonly list: HTMLDivElement
  private readonly active = new Set<string>(['zsh']) // multi-select chips; zsh is the default

  private all: PaletteCommand[] = []
  private categories: ReturnType<typeof buildPaletteCommands>['categories'] = []
  private sel = 0

  constructor() {
    const { modal, close } = overlayModal('picker-modal picker-modal-wide')
    this.close = close

    const h = (<h2>{UITexts.Pickers.command.heading}</h2>) as HTMLHeadingElement
    this.input = (
      <input class="search-box-input" type="text" placeholder={UITexts.Pickers.command.placeholder} />
    ) as HTMLInputElement
    this.input.spellcheck = false
    this.chips = (<div class="md-filters palette-chips" />) as HTMLDivElement
    this.list = (<div class="pick-list picker-list" />) as HTMLDivElement
    modal.append(h, this.input, this.chips, this.list)

    this.input.addEventListener('input', () => {
      this.sel = 0
      this.render()
    })
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      const items = this.filtered()
      if (e.key === 'Escape') this.close()
      else if (e.key === 'ArrowDown') {
        e.preventDefault()
        this.sel = Math.min(items.length - 1, this.sel + 1)
        this.highlight()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        this.sel = Math.max(0, this.sel - 1)
        this.highlight()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (items[this.sel]) this.insert(items[this.sel])
      }
    })
  }

  async open(): Promise<void> {
    const built = buildPaletteCommands(await loadZshCommands())
    this.all = built.all
    this.categories = built.categories

    this.renderChips()
    this.render()
    this.input.focus()
  }

  private filtered = (): PaletteCommand[] => filterPaletteCommands(this.all, this.active, this.input.value)

  // Insert (don't run) the command into the active terminal so the user can edit it.
  private insert = (c: PaletteCommand): void => {
    const id = state.activePaneId
    if (id) {
      selectPane(id)
      terminalService.input(id, c.value)
    }
    this.close()
  }

  private highlight = (): void => {
    this.list.querySelectorAll<HTMLElement>('.palette-row').forEach((el, i) => {
      el.classList.toggle('active', i === this.sel)
    })
  }

  private render = (): void => {
    const items = this.filtered()
    if (this.sel >= items.length) this.sel = Math.max(0, items.length - 1)
    this.list.replaceChildren()
    if (!items.length) {
      this.list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    items.slice(0, 500).forEach((c, i) => {
      this.list.appendChild(
        paletteRow({
          command: c,
          active: i === this.sel,
          onClick: () => this.insert(c),
          onHover: () => {
            this.sel = i
            this.highlight()
          }
        })
      )
    })
  }

  private renderChips = (): void => {
    renderCategoryChips({
      container: this.chips,
      categories: this.categories,
      active: this.active,
      onToggle: (cat) => {
        if (this.active.has(cat)) {
          if (this.active.size > 1) this.active.delete(cat) // keep at least one category active
        } else {
          this.active.add(cat)
        }
        this.sel = 0
        this.renderChips()
        this.render()
      }
    })
  }
}
