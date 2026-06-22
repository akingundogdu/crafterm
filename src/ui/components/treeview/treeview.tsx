// A reusable sidebar tree: nesting + expand/collapse, inline rename, right-click
// context menu (the SHARED sidebar menu, so it matches the terminal exactly),
// color tagging, drag-drop reorder/nesting (before / after / inside), search
// filtering, keyboard navigation, optional section headers, per-row order numbers
// and a light "dynamic refresh" that re-fills slots without rebuilding the DOM.
// The consumer supplies a data-model adapter; the component owns the DOM +
// gestures. Styling lives in treeview.css (shared row classes); consumer-specific
// slot visuals come from each consumer's own stylesheet.
//
// This file is the thin factory: it hands the host + adapter to a
// TreeViewController, which owns all closure state and wires the shared
// `TreeContext` through the extracted pieces in `./components/`.

import './treeview.css'
import type { TreeAdapter, TreeView } from './treeview.types'
import { TreeViewController } from './treeview.controller'

export type { DropPos, TreeMenuItem, TreeSection, TreeAdapter, TreeView } from './treeview.types'

export function createTreeView<T>(host: HTMLElement, a: TreeAdapter<T>): TreeView<T> {
  return new TreeViewController(host, a).view()
}
