import { commandHistory, state } from '@views/state/spine'
import { selectPane } from '@views/commands/commands'
import { terminalService } from '@services'
import { overlayModal } from '../shared'
import type { OpenTerminal, PaletteCommand } from './command.types'
import {
  buildOpenTerminals,
  filterTerminals,
  loadZshCommands,
  buildPaletteCommands,
  filterPaletteCommands
} from './command.state'
import {
  terminalSwitcherStore,
  commandHistoryStore,
  commandPaletteStore
} from './command.store'
import TerminalSwitcherView, { type TerminalSwitcherDeps } from './components/terminal-switcher-view'
import CommandHistoryView, { type CommandHistoryDeps } from './components/command-history-view'
import CommandPaletteView, { type CommandPaletteDeps } from './components/command-palette-view'

// The picker DOM lives in the gea view Components (…-view.tsx) reading command.store;
// each controller stays el-free and owns the overlay, the async load, the selection
// index, and the keyboard navigation, pushing state into the store which the reactive
// views patch on. Public APIs (constructor + open()) are unchanged.

// ---- Terminal switcher: list every open terminal/pane, search, jump to one ----

export class TerminalSwitcherController {
  private readonly modal: HTMLElement
  private readonly close: () => void

  constructor() {
    const { modal, close } = overlayModal('picker-modal picker-modal-wide')
    this.modal = modal
    this.close = close
    terminalSwitcherStore.reset(buildOpenTerminals())

    const deps: TerminalSwitcherDeps = {
      onKeyDown: this.onKey,
      onSelect: this.focusTerm,
      onHover: (i) => terminalSwitcherStore.setSel(i)
    }
    new TerminalSwitcherView(deps).render(modal)
  }

  open(): void {
    ;(this.modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
  }

  private filtered = (): OpenTerminal[] =>
    filterTerminals(terminalSwitcherStore.all, terminalSwitcherStore.search)

  private focusTerm = (t: OpenTerminal): void => {
    selectPane(t.paneId)
    this.close()
  }

  private onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    const items = this.filtered()
    if (e.key === 'Escape') this.close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      terminalSwitcherStore.setSel(Math.min(items.length - 1, terminalSwitcherStore.sel + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      terminalSwitcherStore.setSel(Math.max(0, terminalSwitcherStore.sel - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const t = items[terminalSwitcherStore.sel]
      if (t) this.focusTerm(t)
    }
  }
}

// ---- Command history: filter all app-tracked commands, copy one ----

export class CommandHistoryController {
  private readonly modal: HTMLElement
  private readonly close: () => void

  constructor() {
    const { modal, close } = overlayModal('picker-modal')
    this.modal = modal
    this.close = close
    commandHistoryStore.reset([...commandHistory].reverse()) // most recent first

    const deps: CommandHistoryDeps = { onKeyDown: this.onKey }
    new CommandHistoryView(deps).render(modal)
  }

  open(): void {
    ;(this.modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
  }

  private onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') this.close()
  }
}

// ---- Command palette: zsh + user categories (predefined / cheatsheets) ----

export class CommandPaletteController {
  private readonly modal: HTMLElement
  private readonly close: () => void

  constructor() {
    const { modal, close } = overlayModal('picker-modal picker-modal-wide')
    this.modal = modal
    this.close = close
    commandPaletteStore.reset()

    const deps: CommandPaletteDeps = {
      onKeyDown: this.onKey,
      onSelect: this.insert,
      onHover: (i) => commandPaletteStore.setSel(i),
      onToggle: (cat) => commandPaletteStore.toggle(cat)
    }
    new CommandPaletteView(deps).render(modal)
  }

  async open(): Promise<void> {
    const built = buildPaletteCommands(await loadZshCommands())
    commandPaletteStore.setData(built.all, built.categories)
    ;(this.modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
  }

  private filtered = (): PaletteCommand[] =>
    filterPaletteCommands(commandPaletteStore.all, commandPaletteStore.active, commandPaletteStore.search)

  // Insert (don't run) the command into the active terminal so the user can edit it.
  private insert = (c: PaletteCommand): void => {
    const id = state.activePaneId
    if (id) {
      selectPane(id)
      terminalService.input(id, c.value)
    }
    this.close()
  }

  private onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    const items = this.filtered()
    if (e.key === 'Escape') this.close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      commandPaletteStore.setSel(Math.min(items.length - 1, commandPaletteStore.sel + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      commandPaletteStore.setSel(Math.max(0, commandPaletteStore.sel - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const c = items[commandPaletteStore.sel]
      if (c) this.insert(c)
    }
  }
}
