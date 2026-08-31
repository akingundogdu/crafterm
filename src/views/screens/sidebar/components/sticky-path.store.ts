import type { SidebarNode } from '@views/types/types'
import { ancestorChain } from '@views/tree/tree'

// The non-view half of the sticky ancestor path bar: the pure crumb model plus the
// row-picking maths. No DOM here — the view passes measurements in, so both pieces
// are unit-testable without a layout engine.

// The container ancestors of a row, outermost first (["Musicpal", "backend",
// "worktrees"] for a session inside that worktrees folder). Empty for a top-level row
// or an id the tree no longer holds (the notebook/database modes render their own rows
// into the same list).
export function crumbsFor(tree: SidebarNode[], id: string | null): string[] {
  if (!id) return []
  const chain = ancestorChain(tree, id)
  if (!chain) return []
  return chain.map((n) => n.name)
}

// Index of the first row whose bottom edge sits below `edge` — the topmost row still
// visible under the bar, whose ancestors the bar names. Rows are laid out top to
// bottom, so the predicate is monotonic and a binary search needs only log(n)
// measurements (the list can hold hundreds of rows and this runs per scroll frame).
// Returns -1 when every row is above the edge.
export function pickTopRowIndex(count: number, bottomAt: (i: number) => number, edge: number): number {
  let lo = 0
  let hi = count - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (bottomAt(mid) > edge) {
      found = mid
      hi = mid - 1
    } else {
      lo = mid + 1
    }
  }
  return found
}

// A compact signature of what the bar paints, so an unchanged path skips the re-mount
// (scroll fires far more often than the top row actually changes).
export function crumbSignature(crumbs: string[]): string {
  return crumbs.join('›')
}
