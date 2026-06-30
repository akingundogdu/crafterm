import { el } from '@views/lib/dom'
import type { TreeContext, TreeSection } from '../treeview.types'
import { subtreeMatches } from '../treeview.state'

// Number every visible row top-to-bottom; the first nine map to Cmd+1..9.
function applyOrder<T>(ctx: TreeContext<T>): void {
  if (!ctx.a.numbered) return
  ctx.getLive().forEach((r, i) => {
    if (!r.numEl) return
    r.numEl.textContent = String(i + 1)
    r.numEl.classList.toggle('shortcut', i < 9)
  })
}

// Recursively render `nodes` into the host, applying the active search filter
// (a node survives if it or any descendant matches) and recursing into open or
// filtered containers.
function renderInto<T>(ctx: TreeContext<T>, nodes: T[], depth: number, guides: boolean[]): void {
  const { a, host } = ctx
  const filtering = ctx.getFilter().length > 0
  const filter = ctx.getFilter()
  const list = filtering ? nodes.filter((n) => subtreeMatches(a, n, filter)) : nodes
  list.forEach((node, i) => {
    const isLast = i === list.length - 1
    host.appendChild(ctx.rowOf(node, depth, guides, isLast))
    if (a.isContainer(node) && (filtering || !a.collapsed(node))) {
      renderInto(ctx, a.children(node), depth + 1, [...guides, !isLast])
    }
  })
}

// Render header + node sections, dropping empty section headers, showing an
// empty hint when nothing renders, then re-numbering. Skipped mid-rename so the
// in-progress input survives.
export function renderSections<T>(ctx: TreeContext<T>, sections: TreeSection<T>[]): void {
  const { host } = ctx
  ctx.setLastSections(sections)
  if (ctx.isRenaming()) return // don't blow away an in-progress rename input
  host.replaceChildren()
  ctx.setLive([])
  for (const section of sections) {
    const before = ctx.getLive().length
    const headerEl = section.header ?? null
    if (headerEl) host.appendChild(headerEl)
    renderInto(ctx, section.nodes, 0, [])
    if (headerEl && ctx.getLive().length === before) headerEl.remove() // empty section: drop header
  }
  if (!ctx.getLive().length) {
    const hint = el('div', { class: 'empty-hint' }, ctx.getFilter() ? 'No matches' : 'Nothing here yet.')
    host.appendChild(hint)
  }
  applyOrder(ctx)
}
