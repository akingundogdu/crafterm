// A command palette entry (zsh alias/function or a user category command).
export interface PaletteCommand {
  category: string
  name: string
  value: string
}

// An open terminal/pane row for the terminal switcher.
export interface OpenTerminal {
  paneId: string
  title: string
  group: string
  status: string
  cwd: string | null
  branch: string | null
  claude: boolean
}

// A zsh alias/function command.
export interface ZshCommand {
  name: string
  value: string
}
