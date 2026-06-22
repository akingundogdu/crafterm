import {
  ClaudeDashboardController,
  ClaudeAccountSwitcherController,
  ClaudeSessionResumeController
} from './claude.controller'

// ---- Claude sessions dashboard: list all Claude panes, jump to one ----

export function showClaudeDashboard(): void {
  new ClaudeDashboardController().open()
}

// ---- Switch Claude account: run the user's `claude-switch-*` zsh commands ----
// Discovers any `claude-switch-<name>` alias/function (e.g. `cswap --switch-to N`)
// and runs the chosen one in a new terminal. New Claude terminals then use it.
export async function showClaudeAccountSwitcher(): Promise<void> {
  return new ClaudeAccountSwitcherController().open()
}

// ---- Resume Claude session: list ~/.claude history, search, open with --resume ----

export async function showClaudeSessionResume(): Promise<void> {
  return new ClaudeSessionResumeController().open()
}
