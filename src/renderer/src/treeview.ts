// A reusable sidebar tree: nesting + expand/collapse, inline rename, right-click
// context menu (the SHARED sidebar menu, so it matches the terminal exactly),
// color tagging, and drag-drop reorder/nesting (before / after / inside). The
// consumer supplies a data-model adapter; the component owns the DOM + gestures.
// Styling reuses the shared sidebar row classes (.tab-item / .tab-row / etc.).

import { showContextMenu, type ContextMenuItem } from './contextmenu'

export type DropPos = 'before' | 'after' | 'inside'

export type TreeMenuItem = ContextMenuItem

export interface TreeAdapter<T> {
  id(node: T): string
  label(node: T): string
  icon?(node: T): string // inline SVG html
  iconClass?(node: T): string
  trailing?(node: T): HTMLElement | null // pills/badges appended after the label
  rowClass?(node: T): string
  isContainer(node: T): boolean
  children(node: T): T[]
  collapsed(node: T): boolean
  draggable?(node: T): boolean // default: containers + leaves both draggable
  renamable?(node: T): boolean
  color?(node: T): string | null // row color tag (null = none); enables the swatch row
  onColor?(node: T, color: string | null): void
  menu?(node: T): TreeMenuItem[]
  onToggle(node: T): void
  onClick?(node: T): void
  onActivate?(node: T): void // double-click / Enter on a leaf
  onRename?(node: T, name: string): void
  onMove?(dragId: string, targetId: string, pos: DropPos): void
}

export interface TreeView<T> {
  render(roots: T[]): void
  selectedId: string | null
}

const INDENT = 14
const CHEVRON =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>'

function buildGuides(depth: number, guides: boolean[], isLast: boolean): HTMLElement | null {
  if (depth === 0) return null
  const wrap = document.createElement('div')
  wrap.className = 'row-guides'
  const x = (level: number): number => 10 + level * INDENT + 7
  for (let level = 0; level < depth - 1; level++) {
    if (!guides[level]) continue
    const line = document.createElement('span')
    line.className = 'guide-line'
    line.style.left = x(level) + 'px'
    wrap.appendChild(line)
  }
  const elbow = document.createElement('span')
  elbow.className = 'guide-elbow' + (isLast ? ' last' : '')
  elbow.style.left = x(depth - 1) + 'px'
  wrap.appendChild(elbow)
  return wrap
}

export function createTreeView<T>(host: HTMLElement, a: TreeAdapter<T>): TreeView<T> {
  const state: TreeView<T> = { render, selectedId: null }
  let dragId: string | null = null
  let renaming: string | null = null

  function openMenu(node: T, e: MouseEvent): void {
    const items = a.menu?.(node) ?? []
    const colorOpt = a.color
      ? { current: a.color(node), onPick: (c: string | null) => a.onColor?.(node, c) }
      : undefined
    if (!items.length && !colorOpt) return
    showContextMenu(e, items, colorOpt)
  }

  // Tint a row by its color tag (reuses the terminal sidebar's .has-color vars).
  function hexToRgba(hex: string, alpha: number): string {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
    if (!m) return 'transparent'
    return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`
  }
  function applyRowColor(row: HTMLElement, color: string | null): void {
    if (!color) return
    row.classList.add('has-color')
    row.style.setProperty('--row-color', color)
    row.style.setProperty('--row-tint', hexToRgba(color, 0.085))
  }

  function startRename(node: T, labelEl: HTMLElement): void {
    if (!a.onRename) return
    renaming = a.id(node)
    const input = document.createElement('input')
    input.className = 'rename-input'
    input.value = a.label(node)
    labelEl.replaceWith(input)
    input.focus()
    input.select()
    const commit = (save: boolean): void => {
      if (renaming === null) return
      renaming = null
      const v = input.value.trim()
      if (save && v) a.onRename?.(node, v)
      render(lastRoots)
    }
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation()
      if (ev.key === 'Enter') commit(true)
      else if (ev.key === 'Escape') commit(false)
    })
    input.addEventListener('blur', () => commit(true))
  }

  function rowOf(node: T, depth: number, guides: boolean[], isLast: boolean): HTMLElement {
    const id = a.id(node)
    const container = a.isContainer(node)
    const open = container && !a.collapsed(node)
    const row = document.createElement('div')
    row.className =
      'tab-item' +
      (container ? ' folder' : '') +
      (id === state.selectedId ? ' selected' : '') +
      (a.rowClass ? ' ' + a.rowClass(node) : '')
    row.dataset.treeId = id
    row.style.paddingLeft = 10 + depth * INDENT + 'px'
    if (a.color) applyRowColor(row, a.color(node))
    const g = buildGuides(depth, guides, isLast)
    if (g) row.appendChild(g)

    const top = document.createElement('div')
    top.className = 'tab-row'

    if (container) {
      const tri = document.createElement('span')
      tri.className = 'tri' + (open ? ' expanded' : '')
      tri.innerHTML = CHEVRON
      tri.addEventListener('click', (e) => {
        e.stopPropagation()
        a.onToggle(node)
      })
      top.appendChild(tri)
    }
    if (a.icon) {
      const icon = document.createElement('span')
      icon.className = 'folder-icon' + (a.iconClass ? ' ' + a.iconClass(node) : '')
      icon.innerHTML = a.icon(node)
      top.appendChild(icon)
    }
    const label = document.createElement('span')
    label.className = 'tab-title'
    label.textContent = a.label(node)
    top.appendChild(label)
    const trailing = a.trailing?.(node)
    if (trailing) top.appendChild(trailing)
    row.appendChild(top)

    // interactions
    row.addEventListener('click', () => {
      state.selectedId = id
      a.onClick?.(node)
      if (container) a.onToggle(node)
      else a.onActivate?.(node)
      markSelected()
    })
    if (a.renamable?.(node)) {
      row.addEventListener('dblclick', (e) => {
        e.preventDefault()
        e.stopPropagation()
        startRename(node, label)
      })
    }
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()
      state.selectedId = id
      markSelected()
      openMenu(node, e)
    })

    // drag-drop
    const canDrag = a.draggable ? a.draggable(node) : true
    if (canDrag && a.onMove) {
      row.draggable = true
      row.addEventListener('dragstart', (e) => {
        dragId = id
        e.dataTransfer?.setData('text/plain', id)
        row.classList.add('dragging')
      })
      row.addEventListener('dragend', () => {
        dragId = null
        row.classList.remove('dragging')
        clearDropMarks()
      })
    }
    if (a.onMove) {
      row.addEventListener('dragover', (e) => {
        if (!dragId || dragId === id) return
        e.preventDefault()
        clearDropMarks()
        row.classList.add(dropClass(zoneFor(e, row, container)))
      })
      row.addEventListener('dragleave', () => clearDropMarks())
      row.addEventListener('drop', (e) => {
        e.preventDefault()
        const pos = zoneFor(e, row, container)
        clearDropMarks()
        if (dragId && dragId !== id) a.onMove?.(dragId, id, pos)
        dragId = null
      })
    }
    return row
  }

  // top third = before, bottom third = after, middle = inside (containers only)
  function zoneFor(e: DragEvent, row: HTMLElement, container: boolean): DropPos {
    const r = row.getBoundingClientRect()
    const y = (e.clientY - r.top) / r.height
    if (container) {
      if (y < 0.3) return 'before'
      if (y > 0.7) return 'after'
      return 'inside'
    }
    return y < 0.5 ? 'before' : 'after'
  }

  function clearDropMarks(): void {
    host.querySelectorAll('.drag-before,.drag-after,.drag-into').forEach((el) => {
      el.classList.remove('drag-before', 'drag-after', 'drag-into')
    })
  }
  // map zone → existing CSS class names
  function dropClass(pos: DropPos): string {
    return pos === 'inside' ? 'drag-into' : 'drag-' + pos
  }

  function markSelected(): void {
    host.querySelectorAll<HTMLElement>('.tab-item[data-tree-id]').forEach((el) => {
      el.classList.toggle('selected', el.dataset.treeId === state.selectedId)
    })
  }

  let lastRoots: T[] = []
  function renderInto(nodes: T[], depth: number, guides: boolean[]): void {
    nodes.forEach((node, i) => {
      const isLast = i === nodes.length - 1
      host.appendChild(rowOf(node, depth, guides, isLast))
      if (a.isContainer(node) && !a.collapsed(node)) {
        renderInto(a.children(node), depth + 1, [...guides, !isLast])
      }
    })
  }

  function render(roots: T[]): void {
    lastRoots = roots
    if (renaming) return // don't blow away an in-progress rename input
    host.replaceChildren()
    renderInto(roots, 0, [])
  }

  return state
}
