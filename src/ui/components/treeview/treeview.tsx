// A reusable sidebar tree: nesting + expand/collapse, inline rename, right-click
// context menu (the SHARED sidebar menu, so it matches the terminal exactly),
// color tagging, drag-drop reorder/nesting (before / after / inside), search
// filtering, keyboard navigation, optional section headers, per-row order numbers
// and a light "dynamic refresh" that re-fills slots without rebuilding the DOM.
// The consumer supplies a data-model adapter; the component owns the DOM +
// gestures. Styling lives in treeview.css (shared row classes); consumer-specific
// slot visuals come from each consumer's own stylesheet.
//
// This file is the thin orchestration shell: it owns the closure state
// (`dragId`, `renaming`, `filter`, `live`, `lastSections`) and wires a shared
// `TreeContext` through which the extracted pieces in `./components/` read and
// mutate that state. The state stays here — the single source of truth.

import './treeview.css'
import type { DropPos, TreeAdapter, TreeView, TreeSection, TreeContext, LiveRow } from './treeview.types'
import { rowOf } from './components/row-builder'
import { renderSections } from './components/search-filter'
import { handleKey } from './components/keyboard-nav'
import { select, selectFirst } from './components/selection'
import { startRename, beginRename } from './components/rename-handler'
import { clearDropMarks } from './components/drag-drop'
import { refreshDynamic } from './components/dynamic-refresh'

export type { DropPos, TreeMenuItem, TreeSection, TreeAdapter, TreeView } from './treeview.types'

export function createTreeView<T>(host: HTMLElement, a: TreeAdapter<T>): TreeView<T> {
  const state: TreeView<T> = {
    render,
    renderSections: renderSectionsView,
    setFilter,
    handleKey: handleKeyView,
    select: selectView,
    selectFirst: selectFirstView,
    beginRename: beginRenameView,
    visibleNodes,
    refreshDynamic: refreshDynamicView,
    selectedId: null
  }
  let dragId: string | null = null
  let renaming: string | null = null
  let filter = ''
  let live: LiveRow<T>[] = []
  let lastSections: TreeSection<T>[] = []

  const ctx: TreeContext<T> = {
    host,
    a,
    view: state,
    getDragId: () => dragId,
    setDragId: (id) => {
      dragId = id
    },
    isRenaming: () => renaming !== null,
    setRenaming: (id) => {
      renaming = id
    },
    getFilter: () => filter,
    setFilter: (value) => {
      filter = value
    },
    getLive: () => live,
    setLive: (rows) => {
      live = rows
    },
    getLastSections: () => lastSections,
    setLastSections: (sections) => {
      lastSections = sections
    },
    select: selectView,
    rerender,
    rowOf: (node, depth, guides, isLast) => rowOf(ctx, node, depth, guides, isLast),
    startRename: (node, labelEl) => startRename(ctx, node, labelEl),
    clearDropMarks: () => clearDropMarks(host)
  }

  function renderSectionsView(sections: TreeSection<T>[]): void {
    renderSections(ctx, sections)
  }

  function render(roots: T[]): void {
    renderSectionsView([{ nodes: roots }])
  }

  function rerender(): void {
    renderSectionsView(lastSections)
  }

  function selectView(id: string | null): void {
    select(ctx, id)
  }

  function selectFirstView(): void {
    selectFirst(ctx)
  }

  function beginRenameView(id: string): void {
    beginRename(ctx, id)
  }

  function handleKeyView(e: KeyboardEvent): void {
    handleKey(ctx, e)
  }

  function refreshDynamicView(): void {
    refreshDynamic(ctx)
  }

  function visibleNodes(): T[] {
    return live.map((r) => r.node)
  }

  function setFilter(query: string): void {
    filter = query.trim().toLowerCase()
    rerender()
  }

  return state
}
