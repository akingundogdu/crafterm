import type { TreeContext } from '../treeview.types'

// Index of the nearest shallower ancestor row above `idx` (for ArrowLeft).
function parentIndexOf<T>(ctx: TreeContext<T>, idx: number): number {
  const live = ctx.getLive()
  const depth = live[idx].depth
  for (let i = idx - 1; i >= 0; i--) {
    if (live[i].depth < depth) return i
  }
  return -1
}

// Move the selection by `delta` visible rows, clamped to the list bounds.
function move<T>(ctx: TreeContext<T>, delta: number): void {
  const live = ctx.getLive()
  if (!live.length) return
  let idx = live.findIndex((r) => ctx.a.id(r.node) === ctx.view.selectedId)
  if (idx < 0) idx = delta > 0 ? -1 : 0
  const next = Math.max(0, Math.min(live.length - 1, idx + delta))
  ctx.select(ctx.a.id(live[next].node))
}

// Arrow/Enter keyboard navigation over the visible rows.
export function handleKey<T>(ctx: TreeContext<T>, e: KeyboardEvent): void {
  const { a } = ctx
  const live = ctx.getLive()
  if (!live.length) return
  const idx = live.findIndex((r) => a.id(r.node) === ctx.view.selectedId)
  const cur = idx >= 0 ? live[idx].node : null
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      move(ctx, 1)
      break
    case 'ArrowUp':
      e.preventDefault()
      move(ctx, -1)
      break
    case 'ArrowRight':
      e.preventDefault()
      if (cur && a.isContainer(cur) && a.collapsed(cur)) a.onToggle(cur)
      else move(ctx, 1)
      break
    case 'ArrowLeft': {
      e.preventDefault()
      if (cur && a.isContainer(cur) && !a.collapsed(cur)) {
        a.onToggle(cur)
        break
      }
      const p = idx >= 0 ? parentIndexOf(ctx, idx) : -1
      if (p >= 0) ctx.select(a.id(live[p].node))
      break
    }
    case 'Enter':
      e.preventDefault()
      if (cur && a.isContainer(cur)) a.onToggle(cur)
      else if (cur) a.onActivate?.(cur)
      break
  }
}
