import type { TreeContext } from '../treeview.types'

// Open the inline rename editor on a node. Rename is fully reactive: this only
// flips the store's `renamingId`; the row Component then swaps its label for an
// edit input (and commits on Enter/blur) — no imperative mutation of the
// gea-managed label node, which keyed reconcile would fight.
export function startRename<T>(ctx: TreeContext<T>, node: T): void {
  if (!ctx.a.onRename) return
  ctx.setRenaming(ctx.a.id(node))
}

// Open the inline rename editor on a node by id (public `beginRename`).
export function beginRename<T>(ctx: TreeContext<T>, id: string): void {
  const node = ctx.nodeById.get(id)
  if (node !== undefined) startRename(ctx, node)
}
