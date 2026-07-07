import type { TreeContext } from '../treeview.types'
import type { TreeStore } from '../treeview.store'
import { CHEVRON, applyRowColor } from '../treeview.state'
import { syncSlot } from './dynamic-refresh'
import { wireDragDrop } from './drag-drop'
import { markSelected } from './selection'

// Post-render DOM sync. gea builds each row's chrome (guides / chevron shell /
// label / classes) reactively in its template, but a row's *external* pieces —
// the SVG glyphs, the adapter slot nodes, drag wiring, the colour tint — cannot
// live in a template (an interpolated DOM node renders as an empty comment) and
// gea's `onAfterRender` fires only once per mount, so it can't refresh them on a
// reused row. The controller therefore runs this pass on a `requestAnimationFrame`
// after each (re)render — by then gea has committed the rows to the DOM — and
// reconciles those imperative pieces by querying rows/headers by their stable ids.
// Every step is idempotent (slots diff by outerHTML, drag wires once per element,
// SVG only when empty), so it is safe to re-run every frame.
export function syncDom<T>(ctx: TreeContext<T>, store: TreeStore): void {
  const host = ctx.host
  const a = ctx.a

  for (const item of store.visible) {
    if (item.kind !== 'row') continue
    const row = host.querySelector<HTMLElement>(`.tab-item[data-tree-id="${CSS.escape(item.id)}"]`)
    if (!row) continue
    const node = ctx.nodeById.get(item.id)
    if (node === undefined) continue

    const chevron = row.querySelector<HTMLElement>('.treeview-chevron')
    if (chevron && !chevron.firstChild) chevron.innerHTML = CHEVRON
    const icon = row.querySelector<HTMLElement>('.folder-icon')
    if (icon && !icon.firstChild) {
      const ic = a.icon?.(node)
      if (ic) icon.innerHTML = ic
    }

    const leading = row.querySelector<HTMLElement>('.tree-leading')
    if (leading && a.leading) syncSlot(leading, a.leading(node) ?? null)
    // Trailing is either a reactive gea child (a.trailingComponent, rendered in the
    // row template) or a plain synchronous node (a.trailing) synced here. Never
    // both — don't clear a component-rendered trailing.
    const trailing = a.trailing ? row.querySelector<HTMLElement>('.tree-trailing') : null
    if (trailing) syncSlot(trailing, a.trailing?.(node) ?? null)
    const below = a.below ? row.querySelector<HTMLElement>('.tree-below') : null
    if (below) syncSlot(below, a.below?.(node) ?? null)
    const above = row.querySelector<HTMLElement>('.tree-above')
    if (above) syncSlot(above, a.aboveRow?.(node) ?? null)
    const actions = row.querySelector<HTMLElement>('.tree-actions')
    if (actions) syncSlot(actions, a.hoverActions?.(node) ?? null)

    row.classList.remove('has-color')
    row.style.removeProperty('--row-color')
    row.style.removeProperty('--row-tint')
    if (a.color) applyRowColor(row, a.color(node))

    if (!row.dataset.dragWired) {
      wireDragDrop(ctx, node, item.id, row as HTMLDivElement, a.isContainer(node))
      row.dataset.dragWired = '1'
    }

    const lr = ctx.liveById.get(item.id)
    if (lr) {
      lr.row = row
      lr.leadingHost = leading
      lr.trailingHost = trailing
      lr.belowHost = below
    }
  }

  for (const item of store.visible) {
    if (item.kind !== 'header') continue
    const slot = host.querySelector<HTMLElement>(`.tree-header-slot[data-hdr="${CSS.escape(item.id)}"]`)
    const header = ctx.headerById.get(item.id)
    if (slot && header && slot.firstElementChild !== header) slot.replaceChildren(header)
  }

  markSelected(ctx)

  if (store.renamingId) {
    const input = host.querySelector<HTMLInputElement>(
      `.tab-item[data-tree-id="${CSS.escape(store.renamingId)}"] .rename-input`
    )
    if (input && document.activeElement !== input) {
      input.focus()
      input.select()
    }
  }
}
