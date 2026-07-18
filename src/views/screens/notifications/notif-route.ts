import type { AppNotification, TabNode } from '@views/types/types'
import { panes, poppedOut, state } from '@views/state/spine'
import { findTabByPane } from '@views/tree/tree'

// Resolving a notification back to the terminal it came from, LIVE.
//
// A notification stores `paneId` + a `title` snapshot, and both go stale:
//   - `paneId` is a RUNTIME id. On restore every pane is re-created with a fresh id
//     (only `stableId` is persisted), so a notification that survived the restart
//     pointed at a pane that no longer exists — clicking it did nothing.
//   - `title` was the PANE's title at the moment it fired, while the sidebar labels a
//     terminal by its TAB's title. Renaming the terminal (or the pane title arriving
//     late — it starts empty, hence the "zsh" fallback) left the card showing a name
//     that matched nothing on screen.
//
// So nothing is trusted from the card: the pane is found through the stable id and
// the name is read off the tree at render time. The stored title is only a last
// resort, for a terminal that is genuinely gone.

// The live pane a notification belongs to, or null when it is gone (closed, or not
// restored). Prefers the runtime id — correct within a session — and falls back to a
// scan by stable id, which is what survives a restart.
export function livePaneId(n: AppNotification): string | null {
  if (!n.paneId) return null
  if (panes.has(n.paneId) || poppedOut.has(n.paneId)) return n.paneId
  if (!n.paneStableId) return null
  for (const [id, pane] of panes) {
    if (pane.stableId === n.paneStableId) return id
  }
  return null
}

// The terminal (sidebar tab) that owns a notification, live. Null when its pane is
// gone or no longer sits in any tab.
export function liveTab(n: AppNotification): TabNode | null {
  const paneId = livePaneId(n)
  return paneId ? findTabByPane(state.tree, paneId) : null
}

// What the card/group calls the terminal: the sidebar's own label, so a rename shows
// up immediately. Falls back to the snapshot once the terminal is gone.
export function notifTitle(n: AppNotification): string {
  return liveTab(n)?.title || n.title
}
