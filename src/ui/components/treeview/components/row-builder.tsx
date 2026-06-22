import type { TreeContext } from '../treeview.types'
import { RowBuilder } from './row-builder.controller'

// Build a single tree row: chevron/leading/icon/label/trailing/number/actions,
// depth guides, above/below blocks, color tint, and all gesture handlers
// (click/dblclick/contextmenu + drag-drop). Registers the row in `live`.
export function rowOf<T>(
  ctx: TreeContext<T>,
  node: T,
  depth: number,
  guides: boolean[],
  isLast: boolean
): HTMLElement {
  return new RowBuilder(ctx, node, depth, guides, isLast).build()
}
