import type { PromptCloseActionsOptions, CloseActionsResult } from '../dialog.types'
import { PromptCloseActionsController } from './prompt-close-actions.controller'

// Wide "close terminal" modal: shows the bound task (issue key + title) and any
// worktree this terminal lives in, each with a switch toggled ON by default so
// closing also marks the task done / removes the worktree unless the user flips
// it off. Resolves the chosen toggles, or null when cancelled (terminal stays).
export function promptCloseActions(opts: PromptCloseActionsOptions): Promise<CloseActionsResult | null> {
  return new PromptCloseActionsController(opts).run()
}
