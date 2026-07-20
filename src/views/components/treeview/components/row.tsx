import { Component } from '@geajs/core'
import './row.css'
import { showContextMenu } from '@views/components/context-menu/context-menu'
import { INDENT } from '../treeview.store'
import { getTreeRuntime } from '../treeview.registry'

// One tree row rendered as gea JSX: chevron / leading / icon / label / trailing /
// number / hover-actions, depth guides, above/below blocks. gea owns the reactive
// chrome — guides, the chevron's expanded class, the label vs the inline rename
// input, the row's classes and indent — re-running the template whenever the
// store bumps (`data-rev`) so a row's label/selection/rename state stay live. The
// external pieces (SVG glyphs, adapter slot nodes, drag, colour) are empty hosts
// here; the controller fills them in a post-render pass (see dom-sync), because
// an interpolated node renders as an empty comment and gea's onAfterRender is
// mount-only. Handlers resolve the node fresh at click time (ids are stable).
export default class TreeRow extends Component {
  declare props: { storeId: string; id: string; depth: number; guides: boolean[]; isLast: boolean; num: number }

  private guideX(level: number): number {
    return 10 + level * INDENT + 7
  }

  private commitRename(save: boolean, value: string): void {
    const { ctx, store } = getTreeRuntime(this.props.storeId)
    if (store.renamingId !== this.props.id) return
    const node = ctx.nodeById.get(this.props.id)
    ctx.setRenaming(null)
    const v = value.trim()
    if (save && v && node !== undefined) ctx.a.onRename?.(node, v)
    ctx.rerender()
  }

  private openMenu(e: MouseEvent): void {
    const { ctx } = getTreeRuntime(this.props.storeId)
    const a = ctx.a
    const node = ctx.nodeById.get(this.props.id)
    if (node === undefined) return
    const items = a.menu?.(node) ?? []
    const colorOpt = a.color
      ? { current: a.color(node), onPick: (c: string | null) => a.onColor?.(node, c) }
      : undefined
    if (!items.length && !colorOpt) return
    showContextMenu(e, items, colorOpt)
  }

  template({ storeId, id, depth, guides, isLast, num }: this['props']) {
    const { ctx, store } = getTreeRuntime(storeId)
    const a = ctx.a
    const node = ctx.nodeById.get(id)
    if (node === undefined) return <div class="tab-item" data-tree-id={id} />

    const container = a.isContainer(node)
    const filtering = ctx.getFilter().length > 0
    const open = container && (filtering || !a.collapsed(node))
    const iconHtml = a.icon?.(node)
    const renaming = store.renamingId === id

    const rowClass =
      'tab-item' +
      (container ? ' folder' : '') +
      (id === ctx.view.selectedId ? ' selected' : '') +
      (a.rowClass ? ' ' + a.rowClass(node) : '')

    return (
      <div
        class={rowClass}
        data-tree-id={id}
        data-rev={String(store.rev)}
        style={{ paddingLeft: 10 + depth * INDENT + 'px' }}
        onClick={(e: MouseEvent) => {
          // gea dispatches a delegated click to every ancestor handler regardless
          // of stopPropagation, so a chevron / rename-input click lands here too —
          // skip those (the chevron toggles via its own handler; a click into the
          // rename input must not select/toggle the row).
          const target = e.target as HTMLElement
          if (target.closest('.treeview-chevron') || target.closest('.rename-input')) return
          const n = ctx.nodeById.get(id)
          if (n === undefined) return
          // A handled click (e.g. Cmd+click multi-select) keeps the row's own
          // select/activate out of it.
          if (a.onClick?.(n, e) === true) return
          ctx.select(id)
          if (a.isContainer(n)) a.onToggle(n)
          else a.onActivate?.(n)
        }}
        onDblClick={
          a.renamable?.(node)
            ? (e: MouseEvent) => {
                e.preventDefault()
                e.stopPropagation()
                const n = ctx.nodeById.get(id)
                if (n !== undefined) ctx.startRename(n)
              }
            : undefined
        }
        onContextMenu={(e: MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          ctx.select(id)
          this.openMenu(e)
        }}
      >
        {depth > 0 && (
          <div class="row-guides">
            {guides.map((on, level) =>
              level < depth - 1 && on ? (
                <span key={level} class="guide-line" style={{ left: this.guideX(level) + 'px' }} />
              ) : null
            )}
            <span class={'guide-elbow' + (isLast ? ' last' : '')} style={{ left: this.guideX(depth - 1) + 'px' }} />
          </div>
        )}
        {a.aboveRow ? <div class="tree-above" style={{ display: 'contents' }} /> : null}
        <div class="tab-row">
          {container ? (
            <span
              class={'treeview-chevron' + (open ? ' expanded' : '')}
              onClick={(e: MouseEvent) => {
                e.stopPropagation()
                const n = ctx.nodeById.get(id)
                if (n !== undefined) a.onToggle(n)
              }}
            />
          ) : null}
          {a.leading ? <span class="tree-leading" /> : null}
          {iconHtml ? <span class={'folder-icon' + (a.iconClass ? ' ' + a.iconClass(node) : '')} /> : null}
          {renaming ? (
            <input
              class="rename-input"
              value={a.label(node)}
              onMouseDown={(e: MouseEvent) => e.stopPropagation()}
              onClick={(e: MouseEvent) => e.stopPropagation()}
              onDblClick={(e: MouseEvent) => e.stopPropagation()}
              onKeyDown={(e: KeyboardEvent) => {
                e.stopPropagation()
                if (e.key === 'Enter') this.commitRename(true, (e.target as HTMLInputElement).value)
                else if (e.key === 'Escape') this.commitRename(false, '')
              }}
              onBlur={(e: FocusEvent) => this.commitRename(true, (e.target as HTMLInputElement).value)}
            />
          ) : (
            <span class="tab-title">{a.label(node)}</span>
          )}
          <span class="tree-trailing" />
          {a.numbered ? <span class={'order-num' + (num < 9 ? ' shortcut' : '')}>{String(num + 1)}</span> : null}
          {a.hoverActions ? <span class="tree-actions" style={{ display: 'contents' }} /> : null}
        </div>
        <div class="tree-below" />
      </div>
    )
  }
}
