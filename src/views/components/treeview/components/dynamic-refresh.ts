// Re-fill one dynamic slot (leading/trailing/below/above) only when its rendered
// content actually changed. A wholesale replace every tick would destroy
// interactive sub-rows (iOS worktrees, plan rows) under the cursor mid-click,
// causing flicker and dropped clicks. Shared with the row Component's mount so a
// row's first fill and a later light refresh follow identical, idempotent logic.
export function syncSlot(hostEl: HTMLElement, next: HTMLElement | null): void {
  const cur = hostEl.firstElementChild as HTMLElement | null
  if (!next && !cur) return
  if (next && cur && next.outerHTML === cur.outerHTML) return
  hostEl.replaceChildren()
  if (next) hostEl.appendChild(next)
}
