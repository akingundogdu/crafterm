// A reusable sidebar tree: nesting + expand/collapse, inline rename, right-click
// context menu (the SHARED sidebar menu, so it matches the terminal exactly),
// color tagging, drag-drop reorder/nesting (before / after / inside), search
// filtering, keyboard navigation, optional section headers, per-row order numbers
// and a light "dynamic refresh" that re-fills slots without rebuilding the DOM.
// The consumer supplies a data-model adapter; the component owns the DOM +
// gestures. Styling lives in treeview.css (shared row classes); consumer-specific
// slot visuals come from each consumer's own stylesheet.

import { showContextMenu, type ContextMenuItem } from './contextmenu'
import './treeview.css'

export type DropPos = 'before' | 'after' | 'inside'

export type TreeMenuItem = ContextMenuItem

// One header + a list of root nodes. `render(roots)` is sugar for a single
// header-less section; terminals supply pinned/group sections explicitly.
export interface TreeSection<T> {
  header?: HTMLElement | null
  nodes: T[]
}

export interface TreeAdapter<T> {
  id(node: T): string
  label(node: T): string
  icon?(node: T): string // inline SVG html
  iconClass?(node: T): string
  leading?(node: T): HTMLElement | null // before the label (e.g. a status dot)
  trailing?(node: T): HTMLElement | null // pills/badges appended after the label
  below?(node: T): HTMLElement | null // a block appended under the row (detail/sub-rows)
  aboveRow?(node: T): HTMLElement | null // a block prepended above the row (e.g. a crumb)
  hoverActions?(node: T): HTMLElement | null // hover-revealed action buttons
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
  matches?(node: T, query: string): boolean // search override (default: label contains)
  onSelect?(node: T | null): void // keyboard/programmatic selection changed
  numbered?: boolean // render a per-row order number (first nine map to Cmd+1..9)
}

export interface TreeView<T> {
  render(roots: T[]): void
  renderSections(sections: TreeSection<T>[]): void
  setFilter(query: string): void
  handleKey(e: KeyboardEvent): void
  select(id: string | null): void
  selectFirst(): void
  beginRename(id: string): void // open the inline rename editor on a node
  visibleNodes(): T[]
  refreshDynamic(): void // re-fill leading/trailing/below slots without a rebuild
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

// A rendered row, kept so keyboard nav + light refresh can find it without a
// full rebuild. `slots` host the dynamic (leading/trailing/below) content.
interface LiveRow<T> {
  node: T
  depth: number
  row: HTMLElement
  leadingHost: HTMLElement | null
  trailingHost: HTMLElement
  belowHost: HTMLElement
  numEl: HTMLElement | null
}

export function createTreeView<T>(host: HTMLElement, a: TreeAdapter<T>): TreeView<T> {
  const state: TreeView<T> = {
    render,
    renderSections,
    setFilter,
    handleKey,
    select,
    selectFirst,
    beginRename,
    visibleNodes,
    refreshDynamic,
    selectedId: null
  }
  let dragId: string | null = null
  let renaming: string | null = null
  let filter = ''
  let live: LiveRow<T>[] = []
  let lastSections: TreeSection<T>[] = []

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
      rerender()
    }
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation()
      if (ev.key === 'Enter') commit(true)
      else if (ev.key === 'Escape') commit(false)
    })
    input.addEventListener('blur', () => commit(true))
  }

  // ---- search ----------------------------------------------------------------

  function nodeMatches(node: T, q: string): boolean {
    if (a.matches) return a.matches(node, q)
    return a.label(node).toLowerCase().includes(q)
  }
  function subtreeMatches(node: T, q: string): boolean {
    if (nodeMatches(node, q)) return true
    return a.isContainer(node) && a.children(node).some((c) => subtreeMatches(c, q))
  }

  // ---- row construction ------------------------------------------------------

  function rowOf(node: T, depth: number, guides: boolean[], isLast: boolean): HTMLElement {
    const id = a.id(node)
    const container = a.isContainer(node)
    const filtering = filter.length > 0
    const open = container && (filtering || !a.collapsed(node))
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

    const above = a.aboveRow?.(node)
    if (above) row.appendChild(above)

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
    const leadingHost = document.createElement('span')
    leadingHost.className = 'tree-leading'
    const lead = a.leading?.(node)
    if (lead) leadingHost.appendChild(lead)
    if (lead || a.leading) top.appendChild(leadingHost)

    const iconHtml = a.icon?.(node)
    if (iconHtml) {
      const icon = document.createElement('span')
      icon.className = 'folder-icon' + (a.iconClass ? ' ' + a.iconClass(node) : '')
      icon.innerHTML = iconHtml
      top.appendChild(icon)
    }
    const label = document.createElement('span')
    label.className = 'tab-title'
    label.textContent = a.label(node)
    top.appendChild(label)

    const trailingHost = document.createElement('span')
    trailingHost.className = 'tree-trailing'
    const trailing = a.trailing?.(node)
    if (trailing) trailingHost.appendChild(trailing)
    top.appendChild(trailingHost)

    let numEl: HTMLElement | null = null
    if (a.numbered) {
      numEl = document.createElement('span')
      numEl.className = 'order-num'
      top.appendChild(numEl)
    }

    const actions = a.hoverActions?.(node)
    if (actions) top.appendChild(actions)

    row.appendChild(top)

    const belowHost = document.createElement('div')
    belowHost.className = 'tree-below'
    const below = a.below?.(node)
    if (below) belowHost.appendChild(below)
    row.appendChild(belowHost)

    // interactions
    row.addEventListener('click', () => {
      select(id)
      a.onClick?.(node)
      if (container) a.onToggle(node)
      else a.onActivate?.(node)
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
      select(id)
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
        e.stopPropagation()
        clearDropMarks()
        row.classList.add(dropClass(zoneFor(e, row, container)))
      })
      row.addEventListener('dragleave', () => clearDropMarks())
      row.addEventListener('drop', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const pos = zoneFor(e, row, container)
        clearDropMarks()
        if (dragId && dragId !== id) a.onMove?.(dragId, id, pos)
        dragId = null
      })
    }

    live.push({ node, depth, row, leadingHost: a.leading ? leadingHost : null, trailingHost, belowHost, numEl })
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

  // ---- rendering -------------------------------------------------------------

  function renderInto(nodes: T[], depth: number, guides: boolean[]): void {
    const filtering = filter.length > 0
    const list = filtering ? nodes.filter((n) => subtreeMatches(n, filter)) : nodes
    list.forEach((node, i) => {
      const isLast = i === list.length - 1
      host.appendChild(rowOf(node, depth, guides, isLast))
      if (a.isContainer(node) && (filtering || !a.collapsed(node))) {
        renderInto(a.children(node), depth + 1, [...guides, !isLast])
      }
    })
  }

  function renderSections(sections: TreeSection<T>[]): void {
    lastSections = sections
    if (renaming) return // don't blow away an in-progress rename input
    host.replaceChildren()
    live = []
    for (const section of sections) {
      const before = live.length
      const headerEl = section.header ?? null
      if (headerEl) host.appendChild(headerEl)
      renderInto(section.nodes, 0, [])
      if (headerEl && live.length === before) headerEl.remove() // empty section: drop header
    }
    if (!live.length) {
      const hint = document.createElement('div')
      hint.className = 'empty-hint'
      hint.textContent = filter ? 'No matches' : 'Nothing here yet.'
      host.appendChild(hint)
    }
    applyOrder()
  }

  function render(roots: T[]): void {
    renderSections([{ nodes: roots }])
  }

  function rerender(): void {
    renderSections(lastSections)
  }

  // Number every visible row top-to-bottom; the first nine map to Cmd+1..9.
  function applyOrder(): void {
    if (!a.numbered) return
    live.forEach((r, i) => {
      if (!r.numEl) return
      r.numEl.textContent = String(i + 1)
      r.numEl.classList.toggle('shortcut', i < 9)
    })
  }

  // ---- public helpers --------------------------------------------------------

  function select(id: string | null): void {
    state.selectedId = id
    markSelected()
    scrollSelectedIntoView()
    const entry = live.find((r) => a.id(r.node) === id)
    a.onSelect?.(entry ? entry.node : null)
  }

  function scrollSelectedIntoView(): void {
    if (!state.selectedId) return
    host
      .querySelector<HTMLElement>(`.tab-item[data-tree-id="${CSS.escape(state.selectedId)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }

  function selectFirst(): void {
    if (live.length) select(a.id(live[0].node))
  }

  function beginRename(id: string): void {
    const entry = live.find((r) => a.id(r.node) === id)
    const label = entry?.row.querySelector<HTMLElement>('.tab-title')
    if (entry && label) startRename(entry.node, label)
  }

  function visibleNodes(): T[] {
    return live.map((r) => r.node)
  }

  function parentIndexOf(idx: number): number {
    const depth = live[idx].depth
    for (let i = idx - 1; i >= 0; i--) {
      if (live[i].depth < depth) return i
    }
    return -1
  }

  function move(delta: number): void {
    if (!live.length) return
    let idx = live.findIndex((r) => a.id(r.node) === state.selectedId)
    if (idx < 0) idx = delta > 0 ? -1 : 0
    const next = Math.max(0, Math.min(live.length - 1, idx + delta))
    select(a.id(live[next].node))
  }

  function handleKey(e: KeyboardEvent): void {
    if (!live.length) return
    const idx = live.findIndex((r) => a.id(r.node) === state.selectedId)
    const cur = idx >= 0 ? live[idx].node : null
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        move(-1)
        break
      case 'ArrowRight':
        e.preventDefault()
        if (cur && a.isContainer(cur) && a.collapsed(cur)) a.onToggle(cur)
        else move(1)
        break
      case 'ArrowLeft': {
        e.preventDefault()
        if (cur && a.isContainer(cur) && !a.collapsed(cur)) {
          a.onToggle(cur)
          break
        }
        const p = idx >= 0 ? parentIndexOf(idx) : -1
        if (p >= 0) select(a.id(live[p].node))
        break
      }
      case 'Enter':
        e.preventDefault()
        if (cur && a.isContainer(cur)) a.onToggle(cur)
        else if (cur) a.onActivate?.(cur)
        break
    }
  }

  function setFilter(query: string): void {
    filter = query.trim().toLowerCase()
    rerender()
  }

  // Re-fill the dynamic slots (leading/trailing/below) without rebuilding rows,
  // so e.g. status dots can update while the user is mid-drag/scroll.
  function refreshDynamic(): void {
    if (renaming) return
    for (const r of live) {
      if (r.leadingHost) {
        r.leadingHost.replaceChildren()
        const lead = a.leading?.(r.node)
        if (lead) r.leadingHost.appendChild(lead)
      }
      r.trailingHost.replaceChildren()
      const trailing = a.trailing?.(r.node)
      if (trailing) r.trailingHost.appendChild(trailing)
      r.belowHost.replaceChildren()
      const below = a.below?.(r.node)
      if (below) r.belowHost.appendChild(below)
    }
  }

  return state
}
