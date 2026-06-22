import {
  CommandPaletteController,
  TerminalSwitcherController,
  CommandHistoryController
} from './command.controller'

export type { PaletteCommand, OpenTerminal, ZshCommand } from './command.types'
export { loadZshCommands } from './command.state'

// ---- Command palette: zsh + user categories (predefined / cheatsheets) ----

export async function showCommandPalette(): Promise<void> {
  return new CommandPaletteController().open()
}

// ---- Terminal switcher: list every open terminal/pane, search, jump to one ----

export function showTerminalSwitcher(): void {
  new TerminalSwitcherController().open()
}

// ---- Command history: filter all app-tracked commands, copy one ----

export function showCommandHistory(): void {
  new CommandHistoryController().open()
}
