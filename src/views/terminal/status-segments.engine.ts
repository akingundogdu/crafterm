import type { Pane } from '@views/types/types'
import type { StatusSegment } from './status-bar.types'
import { buildPaneStatus, makeBranchClick } from './status-bar.store'

// An ordered status segment paired with its (optional) click handler — the branch
// segment carries the checkout-picker click; the rest carry none.
export interface StatusSegmentItem {
  segment: StatusSegment
  onClick?: (e: Event) => void
}

// Computes the pane's full cwd plus the ordered, ready-to-render status segment
// items. The branch segment is wired to open the checkout picker for this pane.
export function buildStatusSegments(pane: Pane): { fullCwd: string | null; items: StatusSegmentItem[] } {
  const { fullCwd, segments } = buildPaneStatus(pane)
  const items = segments.map((segment) => ({
    segment,
    onClick: segment.cls === 'branch' ? makeBranchClick(pane.id) : undefined
  }))
  return { fullCwd, items }
}
