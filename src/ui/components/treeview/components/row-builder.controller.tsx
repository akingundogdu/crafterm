import { showContextMenu } from '../../context-menu/context-menu'
import type { TreeContext } from '../treeview.types'
import { INDENT, CHEVRON, applyRowColor } from '../treeview.state'
import { buildGuides } from './row-guide'
import { wireDragDrop } from './drag-drop'

// Builds a single tree row: chevron/leading/icon/label/trailing/number/actions,
// depth guides, above/below blocks, color tint, and all gesture handlers
// (click/dblclick/contextmenu + drag-drop). Registers the row in `live`.
// `build()` returns the row element.
export class RowBuilder<T> {
  private readonly ctx: TreeContext<T>
  private readonly node: T
  private readonly depth: number
  private readonly guides: boolean[]
  private readonly isLast: boolean

  private readonly row: HTMLElement

  constructor(ctx: TreeContext<T>, node: T, depth: number, guides: boolean[], isLast: boolean) {
    this.ctx = ctx
    this.node = node
    this.depth = depth
    this.guides = guides
    this.isLast = isLast

    const { a, host } = ctx
    const id = a.id(node)
    const container = a.isContainer(node)
    const filtering = ctx.getFilter().length > 0
    const open = container && (filtering || !a.collapsed(node))

    const above = a.aboveRow?.(node)

    let tri: HTMLElement | null = null
    if (container) {
      tri = (<span class={'treeview-chevron' + (open ? ' expanded' : '')} innerHTML={CHEVRON} />) as HTMLSpanElement
      tri.addEventListener('click', (e) => {
        e.stopPropagation()
        a.onToggle(node)
      })
    }

    const leadingHost = (<span class="tree-leading" />) as HTMLSpanElement
    const lead = a.leading?.(node)
    if (lead) leadingHost.appendChild(lead)

    const iconHtml = a.icon?.(node)
    const icon = iconHtml
      ? ((
          <span class={'folder-icon' + (a.iconClass ? ' ' + a.iconClass(node) : '')} innerHTML={iconHtml} />
        ) as HTMLSpanElement)
      : null

    const label = (<span class="tab-title">{a.label(node)}</span>) as HTMLSpanElement

    const trailingHost = (<span class="tree-trailing" />) as HTMLSpanElement
    const trailing = a.trailing?.(node)
    if (trailing) trailingHost.appendChild(trailing)

    let numEl: HTMLElement | null = null
    if (a.numbered) {
      numEl = (<span class="order-num" />) as HTMLSpanElement
    }

    const actions = a.hoverActions?.(node)

    const top = (
      <div class="tab-row">
        {tri}
        {(lead || a.leading) && leadingHost}
        {icon}
        {label}
        {trailingHost}
        {numEl}
        {actions}
      </div>
    ) as HTMLDivElement

    const belowHost = (<div class="tree-below" />) as HTMLDivElement
    const below = a.below?.(node)
    if (below) belowHost.appendChild(below)

    const row = (
      <div
        class={
          'tab-item' +
          (container ? ' folder' : '') +
          (id === ctx.view.selectedId ? ' selected' : '') +
          (a.rowClass ? ' ' + a.rowClass(node) : '')
        }
        dataset={{ treeId: id }}
        style={{ paddingLeft: 10 + depth * INDENT + 'px' }}
      >
        {buildGuides(depth, guides, isLast)}
        {above}
        {top}
        {belowHost}
      </div>
    ) as HTMLDivElement
    if (a.color) applyRowColor(row, a.color(node))

    // interactions
    row.addEventListener('click', () => {
      ctx.select(id)
      a.onClick?.(node)
      if (container) a.onToggle(node)
      else a.onActivate?.(node)
    })
    if (a.renamable?.(node)) {
      row.addEventListener('dblclick', (e) => {
        e.preventDefault()
        e.stopPropagation()
        ctx.startRename(node, label)
      })
    }
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()
      ctx.select(id)
      this.openMenu(e)
    })

    // drag-drop
    wireDragDrop(ctx, node, id, row, container)

    ctx.getLive().push({
      node,
      depth,
      row,
      leadingHost: a.leading ? leadingHost : null,
      trailingHost,
      belowHost,
      numEl
    })

    this.row = row
  }

  build(): HTMLElement {
    return this.row
  }

  // Open the shared sidebar context menu for the node (matches the terminal
  // menu), optionally with the color-tag picker.
  private openMenu = (e: MouseEvent): void => {
    const { a } = this.ctx
    const node = this.node
    const items = a.menu?.(node) ?? []
    const colorOpt = a.color
      ? { current: a.color(node), onPick: (c: string | null) => a.onColor?.(node, c) }
      : undefined
    if (!items.length && !colorOpt) return
    showContextMenu(e, items, colorOpt)
  }
}
