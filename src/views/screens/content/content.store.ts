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
