import type { Dir, LayoutNode } from '@views/types/types'
import { state, poppedOut } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'
import {
  findTab,
  firstPaneOf,
  layoutContains,
  splitInLayout,
  movePaneInLayout,
  panesInLayout,
  removePaneFromLayout
} from '@views/tree/tree'
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
// The tiles have their own split layout (`sideBySideRoot`, over the tabs' first
// panes) so they can be dragged into rows/columns and resized like a tab's panes;
// it starts as one row and lives only as long as the view.
let sideBySideTabIds: string[] = []
let sideBySideRoot: LayoutNode | null = null

export function sideBySideTabs(): string[] {
  return sideBySideTabIds
}

export function sideBySideLayout(): LayoutNode | null {
  return sideBySideRoot
}

export function isSideBySide(): boolean {
  return sideBySideTabIds.length > 1
}

// Is this terminal one of the tiles currently on screen? Clicking a pane inside a
// tile must keep the view (it is already visible); anything else leaves it.
export function isTabTiled(tabId: string): boolean {
  return isSideBySide() && sideBySideTabIds.includes(tabId)
}

// The pane a tab contributes as its tile: the first one of its layout.
function tilePaneOf(tabId: string): string | null {
  return firstPaneOf(findTab(state.tree, tabId)?.root)
}

// One equal-width row of leaves — the layout every view starts from.
export function rowOfPanes(paneIds: string[]): LayoutNode | null {
  if (!paneIds.length) return null
  if (paneIds.length === 1) return { type: 'leaf', paneId: paneIds[0] }
  return {
    type: 'split',
    dir: 'row',
    sizes: paneIds.map(() => 1),
    children: paneIds.map((paneId) => ({ type: 'leaf', paneId }))
  }
}

export function setSideBySide(tabIds: string[]): void {
  sideBySideTabIds = tabIds
  sideBySideRoot = rowOfPanes(tabIds.map(tilePaneOf).filter((id): id is string => !!id))
}

// Grow the view by one tile (the strip's "+" buttons). A no-op unless the view is
// on — the tiles are what the user marked, so nothing gets added behind their back.
// The new tile lands to the right of `besidePaneId` (the tile that was active when
// the button was pressed); without one, or if that tile is gone, at the row's end.
export function addSideBySideTab(tabId: string, besidePaneId?: string | null): void {
  if (!isSideBySide() || sideBySideTabIds.includes(tabId)) return
  sideBySideTabIds = [...sideBySideTabIds, tabId]
  const paneId = tilePaneOf(tabId)
  if (!paneId) return
  if (!sideBySideRoot) {
    sideBySideRoot = { type: 'leaf', paneId }
    return
  }
  if (besidePaneId && layoutContains(sideBySideRoot, besidePaneId)) {
    sideBySideRoot = splitInLayout(sideBySideRoot, besidePaneId, paneId, 'row')
    return
  }
  const leaf: LayoutNode = { type: 'leaf', paneId }
  sideBySideRoot =
    sideBySideRoot.type === 'split' && sideBySideRoot.dir === 'row'
      ? { ...sideBySideRoot, sizes: [...sideBySideRoot.sizes, 1], children: [...sideBySideRoot.children, leaf] }
      : { type: 'split', dir: 'row', sizes: [1, 1], children: [sideBySideRoot, leaf] }
}

// Drag-to-rearrange inside the view: drop `dragId` beside `targetId`. Both must be
// tiles; the tabs' own layouts are never touched. False when nothing moved.
export function moveSideBySidePane(dragId: string, targetId: string, dir: Dir, before: boolean): boolean {
  const root = sideBySideRoot
  if (!root || dragId === targetId) return false
  if (!layoutContains(root, dragId) || !layoutContains(root, targetId)) return false
  const next = movePaneInLayout(root, dragId, targetId, dir, before)
  if (!next) return false
  sideBySideRoot = next
  return true
}

// Closing a tile's terminal (its session archived, or the pane itself closed)
// must shrink the view, not leave a dead slot: drop every tile whose pane no
// longer lives in a tiled, live tab, then the tabs left without a tile. When the
// active terminal was the one closed, focus moves to the first remaining tile;
// down to a single tile the view ends and that terminal is shown on its own.
export function pruneSideBySide(): void {
  if (!sideBySideTabIds.length) return
  const liveRoots = new Map<string, LayoutNode>()
  for (const id of sideBySideTabIds) {
    const tab = findTab(state.tree, id)
    if (tab && tab.status !== 'archived') liveRoots.set(id, tab.root)
  }
  const ownerOf = (paneId: string): string | null => {
    for (const [id, root] of liveRoots) if (layoutContains(root, paneId)) return id
    return null
  }
  let root = sideBySideRoot
  const tiled = new Set<string>()
  for (const paneId of root ? panesInLayout(root) : []) {
    const owner = ownerOf(paneId)
    if (owner) tiled.add(owner)
    else root = root && removePaneFromLayout(root, paneId)
  }
  const kept = sideBySideTabIds.filter((id) => tiled.has(id))
  if (kept.length === sideBySideTabIds.length) return
  const firstPane = firstPaneOf(root)
  const firstTab = firstPane ? ownerOf(firstPane) : null
  if (firstTab && (!state.activeTabId || !tiled.has(state.activeTabId))) {
    state.activeTabId = firstTab
    state.selectedNodeId = firstTab
    state.activePaneId = firstPane
  }
  if (kept.length > 1) {
    sideBySideTabIds = kept
    sideBySideRoot = root
    return
  }
  exitSideBySide()
}

// Leaving the view: the borrowed pane elements went back to the tiled container, so
// every tab container has to be rebuilt from its layout — their cached signatures
// would otherwise say "already correct" and leave the panes behind.
export function exitSideBySide(): void {
  if (!sideBySideTabIds.length) return
  sideBySideTabIds = []
  sideBySideRoot = null
  for (const entry of tabContainers.values()) entry.sig = ''
}
