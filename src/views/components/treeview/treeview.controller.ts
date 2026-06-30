import type { TreeAdapter, TreeView, TreeSection, TreeContext, LiveRow } from './treeview.types'
import { rowOf } from './components/row-builder'
import { renderSections } from './components/search-filter'
import { handleKey } from './components/keyboard-nav'
import { select, selectFirst } from './components/selection'
import { startRename, beginRename } from './components/rename-handler'
import { clearDropMarks } from './components/drag-drop'
import { refreshDynamic } from './components/dynamic-refresh'

// Owns one tree's mutable state (`dragId`, `renaming`, `filter`, `live`,
// `lastSections`) and wires a shared `TreeContext` through which the extracted
// pieces in `./components/` read and mutate that state. The state stays here —
// the single source of truth. `view()` returns the public TreeView handle whose
// methods are bound to this controller.
export class TreeViewController<T> {
  private readonly host: HTMLElement
  private readonly a: TreeAdapter<T>

  private dragId: string | null = null
  private renaming: string | null = null
  private filter = ''
  private live: LiveRow<T>[] = []
  private lastSections: TreeSection<T>[] = []

  private readonly state: TreeView<T>
  private readonly ctx: TreeContext<T>

  constructor(host: HTMLElement, a: TreeAdapter<T>) {
    this.host = host
    this.a = a

    this.state = {
      render: this.render,
      renderSections: this.renderSectionsView,
      setFilter: this.setFilter,
      handleKey: this.handleKeyView,
      select: this.selectView,
      selectFirst: this.selectFirstView,
      beginRename: this.beginRenameView,
      visibleNodes: this.visibleNodes,
      refreshDynamic: this.refreshDynamicView,
      selectedId: null
    }

    this.ctx = {
      host,
      a,
      view: this.state,
      getDragId: () => this.dragId,
      setDragId: (id) => {
        this.dragId = id
      },
      isRenaming: () => this.renaming !== null,
      setRenaming: (id) => {
        this.renaming = id
      },
      getFilter: () => this.filter,
      setFilter: (value) => {
        this.filter = value
      },
      getLive: () => this.live,
      setLive: (rows) => {
        this.live = rows
      },
      getLastSections: () => this.lastSections,
      setLastSections: (sections) => {
        this.lastSections = sections
      },
      select: this.selectView,
      rerender: this.rerender,
      rowOf: (node, depth, guides, isLast) => rowOf(this.ctx, node, depth, guides, isLast),
      startRename: (node, labelEl) => startRename(this.ctx, node, labelEl),
      clearDropMarks: () => clearDropMarks(host)
    }
  }

  view(): TreeView<T> {
    return this.state
  }

  private renderSectionsView = (sections: TreeSection<T>[]): void => {
    renderSections(this.ctx, sections)
  }

  private render = (roots: T[]): void => {
    this.renderSectionsView([{ nodes: roots }])
  }

  private rerender = (): void => {
    this.renderSectionsView(this.lastSections)
  }

  private selectView = (id: string | null): void => {
    select(this.ctx, id)
  }

  private selectFirstView = (): void => {
    selectFirst(this.ctx)
  }

  private beginRenameView = (id: string): void => {
    beginRename(this.ctx, id)
  }

  private handleKeyView = (e: KeyboardEvent): void => {
    handleKey(this.ctx, e)
  }

  private refreshDynamicView = (): void => {
    refreshDynamic(this.ctx)
  }

  private visibleNodes = (): T[] => {
    return this.live.map((r) => r.node)
  }

  private setFilter = (query: string): void => {
    this.filter = query.trim().toLowerCase()
    this.rerender()
  }
}
