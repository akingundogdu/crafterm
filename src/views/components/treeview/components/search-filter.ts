import type { TreeContext, TreeSection, LiveRow } from '../treeview.types'
import type { VisibleItem } from '../treeview.store'
import { subtreeMatches } from '../treeview.state'

// Flatten header + node sections into the ordered, filter-applied visible model
// the gea list renders. Pure data — builds no DOM. As a side effect it repopulates
// the controller's plain lookup maps (`nodeById` / `headerById` / `liveById`) and
// the ordered `live` list (skeletons whose DOM refs the row Components fill on
// mount), so keyboard nav / selection / dynamic refresh see rows in visual order.
// A node survives the search filter if it or any descendant matches; open (or
// filtered) containers recurse. Empty section headers are dropped.
export function buildVisible<T>(ctx: TreeContext<T>, sections: TreeSection<T>[]): VisibleItem[] {
  const { a } = ctx
  ctx.nodeById.clear()
  ctx.headerById.clear()
  ctx.liveById.clear()
  const live: LiveRow<T>[] = []
  const items: VisibleItem[] = []
  const filtering = ctx.getFilter().length > 0
  const filter = ctx.getFilter()

  const walk = (nodes: T[], depth: number, guides: boolean[]): void => {
    const list = filtering ? nodes.filter((n) => subtreeMatches(a, n, filter)) : nodes
    list.forEach((node, i) => {
      const isLast = i === list.length - 1
      const id = a.id(node)
      ctx.nodeById.set(id, node)
      const lr: LiveRow<T> = { node, depth, row: null, leadingHost: null, trailingHost: null, belowHost: null, numEl: null }
      ctx.liveById.set(id, lr)
      items.push({ kind: 'row', id, depth, guides: [...guides], isLast, num: live.length })
      live.push(lr)
      if (a.isContainer(node) && (filtering || !a.collapsed(node))) {
        walk(a.children(node), depth + 1, [...guides, !isLast])
      }
    })
  }

  sections.forEach((section, si) => {
    const before = live.length
    const headerNode = section.header ?? null
    const headerId = '__hdr_' + si
    const headerIndex = items.length
    if (headerNode) items.push({ kind: 'header', id: headerId })
    walk(section.nodes, 0, [])
    if (headerNode && live.length > before) ctx.headerById.set(headerId, headerNode)
    else if (headerNode) items.splice(headerIndex, 1) // empty section → drop its header
  })

  ctx.setLive(live)
  return items
}
