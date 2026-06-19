import type { Pane, LayoutNode } from '../types'
import { panes, state, requestSidebar } from '../state'
import { persistence } from '@services/storage/persistence.service'
import { findTabByPane } from '../tree'

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

function firstPaneId(node: LayoutNode): string {
  return node.type === 'leaf' ? node.paneId : firstPaneId(node.children[0])
}
