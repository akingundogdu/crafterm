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
} from './command.store'
import {
  terminalSwitcherStore,
  commandHistoryStore,
  commandPaletteStore
} from './command.store'
import TerminalSwitcherView, { type TerminalSwitcherDeps } from './components/terminal-switcher-view'
import CommandHistoryView, { type CommandHistoryDeps } from './components/command-history-view'
import CommandPaletteView, { type CommandPaletteDeps } from './components/command-palette-view'

export type { PaletteCommand, OpenTerminal, ZshCommand } from './command.types'
export { loadZshCommands } from './command.store'

// The picker DOM lives in the gea view Components (…-view.tsx) reading command.store;
// each entry stays el-free and owns the overlay, the async load, the selection index
// and the keyboard navigation, pushing state into the store which the reactive views
// patch on (no separate controller). Public entry signatures are unchanged.

// ---- Command palette: zsh + user categories (predefined / cheatsheets) ----

export async function showCommandPalette(): Promise<void> {
  const { modal, close } = overlayModal('picker-modal picker-modal-wide')
  commandPaletteStore.reset()

  // Insert (don't run) the command into the active terminal so the user can edit it.
  const insert = (c: PaletteCommand): void => {
    const id = state.activePaneId
    if (id) {
      selectPane(id)
      terminalService.input(id, c.value)
    }
    close()
  }

  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    const items = filterPaletteCommands(commandPaletteStore.all, commandPaletteStore.active, commandPaletteStore.search)
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      commandPaletteStore.setSel(Math.min(items.length - 1, commandPaletteStore.sel + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      commandPaletteStore.setSel(Math.max(0, commandPaletteStore.sel - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const c = items[commandPaletteStore.sel]
      if (c) insert(c)
    }
  }

  const deps: CommandPaletteDeps = {
    onKeyDown: onKey,
    onSelect: insert,
    onHover: (i) => commandPaletteStore.setSel(i),
    onToggle: (cat) => commandPaletteStore.toggle(cat)
  }
  new CommandPaletteView(deps).render(modal)

  const built = buildPaletteCommands(await loadZshCommands())
  commandPaletteStore.setData(built.all, built.categories)
  ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
}

// ---- Terminal switcher: list every open terminal/pane, search, jump to one ----

export function showTerminalSwitcher(): void {
  const { modal, close } = overlayModal('picker-modal picker-modal-wide')
  terminalSwitcherStore.reset(buildOpenTerminals())

  const focusTerm = (t: OpenTerminal): void => {
    selectPane(t.paneId)
    close()
  }

  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    const items = filterTerminals(terminalSwitcherStore.all, terminalSwitcherStore.search)
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      terminalSwitcherStore.setSel(Math.min(items.length - 1, terminalSwitcherStore.sel + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      terminalSwitcherStore.setSel(Math.max(0, terminalSwitcherStore.sel - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const t = items[terminalSwitcherStore.sel]
      if (t) focusTerm(t)
    }
  }

  const deps: TerminalSwitcherDeps = {
    onKeyDown: onKey,
    onSelect: focusTerm,
    onHover: (i) => terminalSwitcherStore.setSel(i)
  }
  new TerminalSwitcherView(deps).render(modal)
  ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
}

// ---- Command history: filter all app-tracked commands, copy one ----

export function showCommandHistory(): void {
  const { modal, close } = overlayModal('picker-modal')
  commandHistoryStore.reset([...commandHistory].reverse()) // most recent first

  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  }

  const deps: CommandHistoryDeps = { onKeyDown: onKey }
  new CommandHistoryView(deps).render(modal)
  ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
}
