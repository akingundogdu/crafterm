import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// Pane-info IPC (pane:*): cwd/branch/worktree + last command for the sidebar,
// plus the main→renderer focus-pane push.
class PaneClient extends BaseClient {
  info = (id: string, stableId?: string) => this.call(Channel.Pane.Info, { id, stableId })
  onFocusPane = (cb: (id: string) => void) => this.listen(Channel.Pane.Focus, (p) => cb(p.id))
}

export const paneService = new PaneClient()
