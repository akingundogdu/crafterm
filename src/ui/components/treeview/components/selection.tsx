import type { TreeContext } from '../treeview.types'

// Mark the selected row in the DOM (toggles `.selected` by data-tree-id).
export function markSelected<T>(ctx: TreeContext<T>): void {
  const selectedId = ctx.view.selectedId
  ctx.host.querySelectorAll<HTMLElement>('.tab-item[data-tree-id]').forEach((el) => {
    el.classList.toggle('selected', el.dataset.treeId === selectedId)
  })
}

// Scroll the currently selected row into view (nearest block).
export function scrollSelectedIntoView<T>(ctx: TreeContext<T>): void {
  const selectedId = ctx.view.selectedId
  if (!selectedId) return
  ctx.host
    .querySelector<HTMLElement>(`.tab-item[data-tree-id="${CSS.escape(selectedId)}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}

// Select a node by id: update state, mark it, reveal it, notify the adapter.
export function select<T>(ctx: TreeContext<T>, id: string | null): void {
  ctx.view.selectedId = id
  markSelected(ctx)
  scrollSelectedIntoView(ctx)
  const entry = ctx.getLive().find((r) => ctx.a.id(r.node) === id)
  ctx.a.onSelect?.(entry ? entry.node : null)
}

// Select the first visible row, if any.
export function selectFirst<T>(ctx: TreeContext<T>): void {
  const live = ctx.getLive()
  if (live.length) ctx.select(ctx.a.id(live[0].node))
}
