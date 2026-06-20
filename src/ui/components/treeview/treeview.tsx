// A reusable sidebar tree: nesting + expand/collapse, inline rename, right-click
// context menu (the SHARED sidebar menu, so it matches the terminal exactly),
// color tagging, drag-drop reorder/nesting (before / after / inside), search
// filtering, keyboard navigation, optional section headers, per-row order numbers
// and a light "dynamic refresh" that re-fills slots without rebuilding the DOM.
// The consumer supplies a data-model adapter; the component owns the DOM +
// gestures. Styling lives in treeview.css (shared row classes); consumer-specific
// slot visuals come from each consumer's own stylesheet.

import { showContextMenu } from '../context-menu/context-menu'
import './treeview.css'
import type { DropPos, TreeAdapter, TreeView, TreeSection, LiveRow } from './treeview.types'
import {
  INDENT,
  CHEVRON,
  applyRowColor,
  subtreeMatches,
  zoneFor,
  dropClass
} from './treeview.state'

export type { DropPos, TreeMenuItem, TreeSection, TreeAdapter, TreeView } from './treeview.types'

function buildGuides(depth: number, guides: boolean[], isLast: boolean): HTMLElement | null {
  if (depth === 0) return null
  const x = (level: number): number => 10 + level * INDENT + 7
  const lines: HTMLElement[] = []
  for (let level = 0; level < depth - 1; level++) {
    if (!guides[level]) continue
    lines.push((<span class="guide-line" style={{ left: x(level) + 'px' }} />) as HTMLSpanElement)
  }
  return (
    <div class="row-guides">
      {lines}
      <span class={'guide-elbow' + (isLast ? ' last' : '')} style={{ left: x(depth - 1) + 'px' }} />
    </div>
  ) as HTMLDivElement
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

  function startRename(node: T, labelEl: HTMLElement): void {
    if (!a.onRename) return
    renaming = a.id(node)
    const input = (<input class="rename-input" />) as HTMLInputElement
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

  // ---- row construction ------------------------------------------------------

  function rowOf(node: T, depth: number, guides: boolean[], isLast: boolean): HTMLElement {
    const id = a.id(node)
    const container = a.isContainer(node)
    const filtering = filter.length > 0
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
          (id === state.selectedId ? ' selected' : '') +
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

  function clearDropMarks(): void {
    host.querySelectorAll('.drag-before,.drag-after,.drag-into').forEach((el) => {
      el.classList.remove('drag-before', 'drag-after', 'drag-into')
    })
  }

  function markSelected(): void {
    host.querySelectorAll<HTMLElement>('.tab-item[data-tree-id]').forEach((el) => {
      el.classList.toggle('selected', el.dataset.treeId === state.selectedId)
    })
  }

  // ---- rendering -------------------------------------------------------------

  function renderInto(nodes: T[], depth: number, guides: boolean[]): void {
    const filtering = filter.length > 0
    const list = filtering ? nodes.filter((n) => subtreeMatches(a, n, filter)) : nodes
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
      const hint = (
        <div class="empty-hint">{filter ? 'No matches' : 'Nothing here yet.'}</div>
      ) as HTMLDivElement
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
  // so e.g. status dots can update while the user is mid-drag/scroll. Only swap a
  // slot when its rendered content actually changed: a wholesale replace every
  // tick would destroy interactive sub-rows (iOS worktrees, plan rows) under the
  // cursor mid-click, causing flicker and dropped clicks.
  function syncSlot(hostEl: HTMLElement, next: HTMLElement | null): void {
    const cur = hostEl.firstElementChild as HTMLElement | null
    if (!next && !cur) return
    if (next && cur && next.outerHTML === cur.outerHTML) return
    hostEl.replaceChildren()
    if (next) hostEl.appendChild(next)
  }

  function refreshDynamic(): void {
    if (renaming) return
    for (const r of live) {
      if (r.leadingHost) syncSlot(r.leadingHost, a.leading?.(r.node) ?? null)
      syncSlot(r.trailingHost, a.trailing?.(r.node) ?? null)
      syncSlot(r.belowHost, a.below?.(r.node) ?? null)
    }
  }

  return state
}
