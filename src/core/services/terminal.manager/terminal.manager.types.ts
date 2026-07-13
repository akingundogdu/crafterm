import type { BrowserWindow } from 'electron'

// Dependencies the manager can't own itself yet: the main window (created in
// index.ts) and the ZDOTDIR shell-integration state (set up alongside the shim).
// Injected via init() so the manager stays free of window/lifecycle concerns.
export interface TerminalManagerDeps {
  getMainWindow: () => BrowserWindow | null
  isShellIntegrationReady: () => boolean
  getZdotDir: () => string
}
