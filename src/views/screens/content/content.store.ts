import type { LayoutNode } from '@views/types/types'
import { state, poppedOut } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'
import { findTab } from '@views/tree/tree'
import { terminalService } from '@services'

// Each tab's layout lives in its own container that stays in the DOM; switching
// tabs only flips `display`, so panes are never detached/reattached. A container
// is rebuilt only when its tab's layout structure or split sizes actually change.
export const tabContainers = new Map<string, { el: HTMLElement; sig: string }>()

// A structural fingerprint of a layout: pane ids, split directions and sizes.
// Same signature ⇒ the DOM is already correct, so we skip the rebuild.
export function layoutSig(node: LayoutNode): string {
  if (node.type === 'leaf') return poppedOut.has(node.paneId) ? 'pop:' + node.paneId : node.paneId
  return `${node.dir}[${node.sizes.join(',')}](${node.children.map(layoutSig).join(',')})`
}

// Click handler for a popped-out pane's placeholder: focuses its window.
export function makePopoutFocus(paneId: string): () => void {
  return () => terminalService.popoutFocus(paneId)
}

// After a resizer drag mutated node.sizes + the DOM directly (no rebuild), the
// cached layout signature is stale. Refresh it — otherwise a later equalize/
// render computing the same sig is skipped and the dragged sizes stay stuck —
// then persist.
export function persistResizedLayout(): void {
  const tab = state.activeTabId ? findTab(state.tree, state.activeTabId) : null
  const entry = tab ? tabContainers.get(tab.id) : null
  if (tab && entry) entry.sig = layoutSig(tab.root)
  persistence.save()
}

// ---- Side-by-side view (todomraex8usk1) ------------------------------------
// The terminals the user Cmd+clicked in the sidebar and asked to see together. A
// VIEW only: the tabs and their layouts are untouched, the panes' DOM is borrowed
// into a tiled container until the view is left (picking any terminal leaves it).
let sideBySideTabIds: string[] = []

export function sideBySideTabs(): string[] {
  return sideBySideTabIds
}

export function isSideBySide(): boolean {
  return sideBySideTabIds.length > 1
}

// Is this terminal one of the tiles currently on screen? Clicking a pane inside a
// tile must keep the view (it is already visible); anything else leaves it.
export function isTabTiled(tabId: string): boolean {
  return isSideBySide() && sideBySideTabIds.includes(tabId)
}

export function setSideBySide(tabIds: string[]): void {
  sideBySideTabIds = tabIds
}

// Leaving the view: the borrowed pane elements went back to the tiled container, so
// every tab container has to be rebuilt from its layout — their cached signatures
// would otherwise say "already correct" and leave the panes behind.
export function exitSideBySide(): void {
  if (!sideBySideTabIds.length) return
  sideBySideTabIds = []
  for (const entry of tabContainers.values()) entry.sig = ''
}
