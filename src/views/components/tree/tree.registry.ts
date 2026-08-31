import type { TreeStore } from './tree.store'
import type { TreeCallbacks, TreeRow, TreeSectionData } from './tree.types'

// Per-instance render runtime, looked up by a string `treeId` so a gea child
// Component can reach the genuine reactive store proxy (tracking fires on the
// proxy get regardless of how the reference was reached) plus the plain lookup
// maps + callbacks — without a store/DOM node ever crossing a proxied prop. Same
// indirection the legacy treeview uses; the maps here hold ROW DATA, not DOM.
export interface TreeRuntime {
  store: TreeStore
  callbacks: TreeCallbacks
  host: HTMLElement
  rowById: Map<string, TreeRow>
  sectionById: Map<string, TreeSectionData>
  getFilter: () => string
  // re-flatten the last sections + bump the store (used after an inline rename
  // commit, where the consumer may not itself trigger a full re-render)
  rerender: () => void
  // the in-flight drag source id + imperative drop-mark helpers (drag hover is
  // applied straight to the two cards, not through the reactive store)
  getDragId: () => string | null
  setDragId: (id: string | null) => void
  clearDropMarks: () => void
  select: (id: string | null) => void
  // open the inline rename editor on a row (sets renaming, re-renders, focuses)
  beginRename: (id: string) => void
}

const registry = new Map<string, TreeRuntime>()

export function setTreeRuntime(id: string, rt: TreeRuntime): void {
  registry.set(id, rt)
}

export function getTreeRuntime(id: string): TreeRuntime {
  const rt = registry.get(id)
  if (!rt) throw new Error(`tree runtime not found: ${id}`)
  return rt
}

export function clearTreeRuntime(id: string): void {
  registry.delete(id)
}
