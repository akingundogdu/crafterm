import type { TreeContext } from '../treeview.types'

// Re-fill one dynamic slot (leading/trailing/below) only when its rendered
// content actually changed. A wholesale replace every tick would destroy
// interactive sub-rows (iOS worktrees, plan rows) under the cursor mid-click,
// causing flicker and dropped clicks.
function syncSlot(hostEl: HTMLElement, next: HTMLElement | null): void {
  const cur = hostEl.firstElementChild as HTMLElement | null
  if (!next && !cur) return
  if (next && cur && next.outerHTML === cur.outerHTML) return
  hostEl.replaceChildren()
  if (next) hostEl.appendChild(next)
}

// Re-fill the dynamic slots across all live rows without rebuilding rows, so
// e.g. status dots can update while the user is mid-drag/scroll.
export function refreshDynamic<T>(ctx: TreeContext<T>): void {
  if (ctx.isRenaming()) return
  const { a } = ctx
  for (const r of ctx.getLive()) {
    if (r.leadingHost) syncSlot(r.leadingHost, a.leading?.(r.node) ?? null)
    syncSlot(r.trailingHost, a.trailing?.(r.node) ?? null)
    syncSlot(r.belowHost, a.below?.(r.node) ?? null)
  }
}
