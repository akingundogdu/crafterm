import { Component } from '@geajs/core'
import './tree-row.css'
import { showContextMenu } from '@views/components/context-menu/context-menu'
import { getTreeRuntime } from '../tree.registry'
import { INDENT, colorVars, zoneFor, dropClass } from '../tree.store'
import type { DetailRow } from '../tree.types'
import { guideX, badgeClass } from './tree-row.store'
import TreeGlyph from './tree-glyph'
import { CHEVRON_SVG, iconSvg } from './tree-glyph.store'

// One tree card rendered as gea JSX: crumb (pinned) · [chevron · dot · icon ·
// label/rename · badges · order · actions] · detail sub-rows, with indent guides.
// gea owns all reactive chrome (label, selection/active classes, chevron state,
// colour tint, rename input) — re-running the template whenever the store bumps
// (`data-rev`). SVG glyphs are the only imperative bit, injected once by the
// stable <TreeGlyph> child. Handlers resolve the row fresh at event time (ids are
// stable), so a reused instance never acts on stale data.
export default class TreeRow extends Component {
  declare props: { treeId: string; id: string; depth: number; guides: boolean[]; num: number }

  private openMenu(e: MouseEvent): void {
    const { callbacks, rowById } = getTreeRuntime(this.props.treeId)
    const id = this.props.id
    if (!rowById.has(id)) return
    const items = callbacks.menu(id) ?? []
    const colorOpt = callbacks.colorOf
      ? { current: callbacks.colorOf(id), onPick: (c: string | null) => callbacks.onColor(id, c) }
      : undefined
    if (!items.length && !colorOpt) return
    showContextMenu(e, items, colorOpt)
  }

  private commitRename(save: boolean, value: string): void {
    const { store, callbacks, rerender } = getTreeRuntime(this.props.treeId)
    const id = this.props.id
    if (store.renamingId !== id) return
    store.setRenaming(null)
    const v = value.trim()
    if (save && v) callbacks.onRename(id, v)
    rerender()
  }

  private onDragStart(e: DragEvent): void {
    const { rowById, setDragId } = getTreeRuntime(this.props.treeId)
    const row = rowById.get(this.props.id)
    if (!row || row.draggable === false) {
      e.preventDefault()
      return
    }
    setDragId(this.props.id)
    e.dataTransfer?.setData('text/plain', this.props.id)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }

  private onDragOver(e: DragEvent): void {
    const { getDragId, clearDropMarks, rowById } = getTreeRuntime(this.props.treeId)
    const dragId = getDragId()
    if (!dragId || dragId === this.props.id) return
    e.preventDefault()
    clearDropMarks()
    const card = e.currentTarget as HTMLElement
    const pos = zoneFor(e, card, rowById.get(this.props.id)?.isContainer ?? false)
    card.classList.add(dropClass(pos))
  }

  private onDragLeave(e: DragEvent): void {
    ;(e.currentTarget as HTMLElement).classList.remove('crtree-drag-before', 'crtree-drag-after', 'crtree-drag-into')
  }

  private onDrop(e: DragEvent): void {
    e.preventDefault()
    e.stopPropagation()
    const { getDragId, setDragId, clearDropMarks, callbacks, rowById } = getTreeRuntime(this.props.treeId)
    const dragId = getDragId()
    clearDropMarks()
    if (!dragId || dragId === this.props.id) return
    const pos = zoneFor(e, e.currentTarget as HTMLElement, rowById.get(this.props.id)?.isContainer ?? false)
    callbacks.onMove(dragId, this.props.id, pos)
    setDragId(null)
  }

  private onDragEnd(): void {
    const { clearDropMarks, setDragId } = getTreeRuntime(this.props.treeId)
    clearDropMarks()
    setDragId(null)
  }

  private subClick(detail: DetailRow): (e: MouseEvent) => void {
    return (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.crtree-sub-kill')) {
        detail.onKill?.(e)
        return
      }
      detail.onClick?.(e)
    }
  }

  template({ treeId, id, depth, guides, num }: this['props']) {
    const rt = getTreeRuntime(treeId)
    const { store, callbacks } = rt
    const row = rt.rowById.get(id)
    if (!row) return <div class="crtree-card" data-tree-id={id} />

    const filtering = rt.getFilter().length > 0
    const hasChevron = row.isContainer || row.expandable === true
    const open = row.isContainer ? filtering || !row.collapsed : row.expanded === true
    const renaming = store.renamingId === id
    const selected = store.selectedId === id

    const cls =
      'crtree-card' +
      (row.isContainer ? ' crtree-folder' : '') +
      (row.active ? ' crtree-active' : '') +
      (selected && !row.active ? ' crtree-selected' : '') +
      (row.color ? ' crtree-colored' : '') +
      (row.multiSelected ? ' crtree-multi' : '') +
      (row.extraClass ? ' ' + row.extraClass : '')

    return (
      <div
        class={cls}
        data-tree-id={id}
        data-rev={String(store.rev)}
        draggable={row.draggable === false ? undefined : 'true'}
        style={{ ...colorVars(row.color), paddingLeft: 10 + depth * INDENT + 'px' }}
        onClick={(e: MouseEvent) => {
          const target = e.target as HTMLElement
          if (
            target.closest('.crtree-chevron') ||
            target.closest('.crtree-rename') ||
            target.closest('.crtree-detail') ||
            target.closest('.crtree-act')
          )
            return
          const r = rt.rowById.get(id)
          if (!r) return
          if (callbacks.onClick?.(id, e) === true) return
          rt.select(id)
          if (r.isContainer) callbacks.onToggle(id)
          else callbacks.onActivate(id)
        }}
        onDblClick={
          row.renamable
            ? (e: MouseEvent) => {
                e.preventDefault()
                e.stopPropagation()
                rt.beginRename(id)
              }
            : undefined
        }
        onContextMenu={(e: MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          rt.select(id)
          this.openMenu(e)
        }}
        onDragStart={(e: DragEvent) => this.onDragStart(e)}
        onDragOver={(e: DragEvent) => this.onDragOver(e)}
        onDragLeave={(e: DragEvent) => this.onDragLeave(e)}
        onDrop={(e: DragEvent) => this.onDrop(e)}
        onDragEnd={() => this.onDragEnd()}
      >
        {depth > 0
          ? guides.map((on, level) =>
              on ? <span key={level} class="crtree-guide" style={{ left: guideX(level) + 'px' }} /> : null
            )
          : null}

        {row.crumb ? (
          <div class="crtree-crumb">
            <span class="crtree-crumb-dot" style={row.crumb.color ? { background: row.crumb.color } : undefined} />
            <span class="crtree-crumb-text">{row.crumb.text}</span>
          </div>
        ) : null}

        <div class="crtree-main">
          {hasChevron ? (
            <span
              class={'crtree-chevron' + (open ? ' crtree-open' : '')}
              onClick={(e: MouseEvent) => {
                e.stopPropagation()
                rt.callbacks.onToggle(id)
              }}
            >
              <TreeGlyph svg={CHEVRON_SVG} cls="crtree-chevron-svg" />
            </span>
          ) : null}

          {row.statusDot ? <span class={'crtree-dot crtree-dot-' + row.statusDot} /> : null}

          {row.icon ? <TreeGlyph svg={iconSvg(row.icon)} cls={'crtree-icon crtree-icon-' + row.icon} /> : null}

          {renaming ? (
            <input
              class="crtree-rename"
              value={row.label}
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
            <span class="crtree-label">{row.label}</span>
          )}

          {row.badges && row.badges.length ? (
            <span class="crtree-badges">
              {row.badges.map((b, bi) => (
                <span key={b.kind + bi} class={badgeClass(b)} title={b.title}>
                  {b.text || ''}
                </span>
              ))}
            </span>
          ) : null}

          {callbacks.numbered ? (
            <span class={'crtree-order' + (num < 9 ? ' crtree-order-shortcut' : '')}>{String(num + 1)}</span>
          ) : null}

          {row.actions && row.actions.length ? (
            <span class="crtree-actions">
              {row.actions.map((act, ai) => (
                <button
                  key={act.title + ai}
                  class="crtree-act"
                  title={act.title}
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation()
                    act.run(e)
                  }}
                >
                  {act.glyph}
                </button>
              ))}
            </span>
          ) : null}
        </div>

        {row.detail && row.detail.length ? (
          <div class="crtree-detail">
            {row.detail.map((sub) => (
              <div
                key={sub.id}
                class={'crtree-sub crtree-sub-' + sub.kind}
                title={sub.title}
                onClick={this.subClick(sub)}
              >
                <span class="crtree-sub-label">{(sub.done ? '✓ ' : '') + sub.label}</span>
                {sub.onKill ? <span class="crtree-sub-kill" title="Stop">×</span> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    )
  }
}
