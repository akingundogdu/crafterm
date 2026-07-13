import { uid } from '@views/state/spine'
import type { TreeAdapter, TreeView, TreeSection, TreeContext, LiveRow } from './treeview.types'
import { TreeStore } from './treeview.store'
import { setTreeRuntime } from './treeview.registry'
import TreeViewComponent from './treeview.view'
import { buildVisible } from './components/search-filter'
import { syncDom } from './components/dom-sync'
import { handleKey } from './components/keyboard-nav'
import { select, selectFirst } from './components/selection'
import { startRename, beginRename } from './components/rename-handler'
import { clearDropMarks } from './components/drag-drop'

// Owns one tree's mutable state (`dragId`, `renaming`, `filter`, `live`,
// `lastSections`) + the per-instance reactive `TreeStore`, wiring a shared
// `TreeContext` through which the extracted pieces read and mutate that state.
// `render`/`renderSections` no longer build DOM — they flatten the sections into
// `store.visible`; the gea `TreeView` mounted into `host` renders the rows and its
// `TreeRow`s fill the `live` skeletons on mount. `view()` returns the public
// handle whose methods bind to this controller.
export class TreeViewController<T> {
  private readonly a: TreeAdapter<T>

  private dragId: string | null = null
  private filter = ''
  private live: LiveRow<T>[] = []
  private lastSections: TreeSection<T>[] = []
  private syncScheduled = false

  private readonly store: TreeStore
  private readonly storeId: string
  private readonly state: TreeView<T>
  private readonly ctx: TreeContext<T>
  private rootEl: Element | null = null

  constructor(host: HTMLElement, a: TreeAdapter<T>) {
    this.a = a
    this.store = new TreeStore()
    this.storeId = uid('tree')

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
      nodeById: new Map<string, T>(),
      headerById: new Map<string, HTMLElement>(),
      liveById: new Map<string, LiveRow<T>>(),
      getDragId: () => this.dragId,
      setDragId: (id) => {
        this.dragId = id
      },
      isRenaming: () => this.store.renamingId !== null,
      setRenaming: (id) => {
        this.store.setRenaming(id)
        this.scheduleSync()
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
      startRename: (node) => startRename(this.ctx, node),
      clearDropMarks: () => clearDropMarks(host)
    }

    setTreeRuntime(this.storeId, { store: this.store, ctx: this.ctx })
    host.replaceChildren()
    new TreeViewComponent(this.storeId).render(host)
    this.rootEl = host.querySelector('.treeview-root')
  }

  // Other sidebar modes (notebook/database/accounts/…) render straight into the
  // shared host, detaching this tree's gea root. When terminal mode renders again,
  // re-attach the SAME root (no new instance → no orphaned, still-subscribed gea
  // trees accumulating) before pushing the new visible model.
  private ensureMounted(): void {
    const host = this.ctx.host
    if (this.rootEl && !host.contains(this.rootEl)) host.replaceChildren(this.rootEl)
  }

  view(): TreeView<T> {
    return this.state
  }

  private renderSectionsView = (sections: TreeSection<T>[]): void => {
    this.lastSections = sections
    if (this.store.renamingId !== null) return // don't rebuild under an in-progress rename
    this.ensureMounted()
    this.store.setVisible(buildVisible(this.ctx, sections))
    this.scheduleSync()
  }

  // Reconcile the external row pieces (SVG / slots / drag / colour / headers /
  // selection) once gea has committed this render's rows to the DOM. gea flushes
  // its render before the next animation frame, so a coalesced rAF is the reliable
  // moment to query the fresh rows (a microtask still sees the previous frame).
  private scheduleSync = (): void => {
    if (this.syncScheduled) return
    this.syncScheduled = true
    requestAnimationFrame(() => {
      this.syncScheduled = false
      syncDom(this.ctx, this.store)
    })
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

  // Light status refresh (no rebuild): re-run the imperative DOM sync straight
  // away — it queries the live rows and diffs their slots by outerHTML, so a
  // changed claude-status pill / background-process sub-row updates in place.
  // Skipped mid-rename so an in-progress edit input is never disturbed.
  private refreshDynamicView = (): void => {
    if (this.store.renamingId !== null) return
    syncDom(this.ctx, this.store)
  }

  private visibleNodes = (): T[] => {
    return this.live.map((r) => r.node)
  }

  private setFilter = (query: string): void => {
    this.filter = query.trim().toLowerCase()
    this.rerender()
  }
}
