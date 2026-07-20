import type { Pane, LayoutNode } from '@views/types/types'
import { panes, state, requestSidebar } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'
import { findTabByPane } from '@views/tree/tree'

export function onPaneTitle(pane: Pane, raw: string): void {
  const clean = raw.trim()
  // For a Claude pane, the session jsonl is the single source of truth for the
  // title (applyClaudeSessionTitle). Ignoring the terminal's own OSC title here
  // stops a shell/cwd repaint from clobbering a freshly /rename'd title — the
  // race behind "sometimes the rename sticks" — and keeps a cwd title off the
  // tab label in the brief window before the session id is captured.
  const claudeDriven = pane.claude
  if (!pane.titleLocked && !claudeDriven && clean) {
    pane.title = clean
    pane.htitle.textContent = clean
  }
  mirrorPaneTitleToTab(pane)
  requestSidebar()
  persistence.save()
}

// A single-pane tab's sidebar label mirrors its pane's title. Shared by the OSC
// title path and the Claude session-title path so a /rename updates the main tab
// label, not just the per-pane sub-row.
export function mirrorPaneTitleToTab(pane: Pane): void {
  const tab = findTabByPane(state.tree, pane.id)
  if (tab && !tab.titleLocked) {
    const firstPaneTitle = panes.get(firstPaneId(tab.root))?.title
    if (firstPaneTitle) tab.title = firstPaneTitle
  }
}

// A name the user typed on the pane header. The sidebar labels a terminal by its
// TAB's title, so a pane rename that never reached the tab read as "the rename did
// nothing" — the row kept its "zsh 3" default. Renaming the pane that leads the tab
// therefore renames the terminal, and locks it: typing a name is as explicit as
// renaming the row itself, and an explicit name must survive the next OSC/Claude
// title (and the restart that replays them).
export function applyPaneRenameToTab(pane: Pane): void {
  const tab = findTabByPane(state.tree, pane.id)
  if (!tab || firstPaneId(tab.root) !== pane.id || !pane.title) return
  tab.title = pane.title
  tab.titleLocked = true
}

// A fresh /rename inside the Claude session is the newest explicit action — it
// beats an earlier lock (a ticket title or a manual sidebar rename). Unlock the
// pane and, when this pane leads its tab, the tab too, so the new title can
// mirror onto the sidebar row.
export function unlockTitlesForSessionRename(pane: Pane): void {
  pane.titleLocked = false
  const tab = findTabByPane(state.tree, pane.id)
  if (tab && firstPaneId(tab.root) === pane.id) tab.titleLocked = false
}

function firstPaneId(node: LayoutNode): string {
  return node.type === 'leaf' ? node.paneId : firstPaneId(node.children[0])
}
