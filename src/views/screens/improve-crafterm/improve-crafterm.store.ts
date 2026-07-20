import { Store } from '@geajs/core'
import { focusWhenReady } from '@views/lib/focus'
import { settings, uid } from '@views/state/spine'
import { appService, todoService } from '@services'
import { createOverlay } from '@views/components/overlay/overlay'
import {
  type TodoDoc,
  type TodoItemJson,
  type TodoFileJson,
  emptyDoc,
  jsonToDoc,
  parseTodo,
  sectionBy,
  ensureSection
} from '@views/screens/improve-crafterm/todo-doc'
import ImprovePanel from './improve-crafterm'
import DetailModal from './components/detail-modal'

// Pure logic + overlay-mounting entries for the Improve Crafterm panel
// (self-contained port of the legacy @ui improve-crafterm state). All DOM lives
// in the gea components (ImprovePanel renders the `.modal.improve-modal` shell;
// DetailModal renders the read-only detail body); these entries only own the
// overlay backdrop + keyboard/window lifecycle around them. Self-contained — no
// @ui (§2.7).

// ---- todo store ---------------------------------------------------------
// The backing store is JSON (todo-list.json): a flat list of items, each with
// its own id / status / priority / timestamps. The in-memory working model is
// still the section-based TodoDoc (so the panel render/CRUD code is unchanged);
// loadDoc() expands the JSON into sections, saveDoc() flattens it back, keeping
// each item's id + createdAt stable across edits where the text is unchanged.

// JSON path derived from the configured todo file (…/todo-list.md → …/todo-list.json).
export function todoJsonPath(): string {
  const p = settings.todoFile.trim()
  if (!p) return ''
  return /\.json$/i.test(p) ? p : p.replace(/\.md$/i, '') + '.json'
}

// Flatten the working model back into JSON, preserving id/createdAt for items
// whose text is unchanged (matched by status+text against the previous load).
export function docToJson(doc: TodoDoc, prev: TodoItemJson[]): TodoFileJson {
  const byKey = new Map<string, TodoItemJson>()
  for (const it of prev) byKey.set(it.status + ' ' + it.text, it)
  const now = Date.now()
  const items: TodoItemJson[] = []
  for (const s of doc.sections) {
    s.items.forEach((text, idx) => {
      const old = byKey.get(s.heading + ' ' + text)
      items.push({
        id: old?.id ?? uid('todo'),
        text,
        status: s.heading,
        priority: idx,
        createdAt: old?.createdAt ?? now,
        updatedAt: now
      })
    })
  }
  return {
    version: 1,
    preamble: doc.preamble,
    sectionsOrder: doc.sections.map((s) => s.heading),
    items
  }
}

// Open a read-only detail modal that shows a single backlog/ready/done entry
// in full — used when a one-line row gets truncated and the user needs to
// read the whole thing.
export function showDetail(fullText: string): void {
  const { overlay, mount, close, onClose } = createOverlay()
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  onClose(() => document.removeEventListener('keydown', onKey, true))
  document.addEventListener('keydown', onKey, true)
  new DetailModal({ fullText, close }).render(overlay)
  mount()
}

// ---- header button handlers --------------------------------------------

// "Open in window" detaches Improve into a standalone always-available window,
// then closes the in-panel modal.
export function makePopoutClick(close: () => void): () => void {
  return () => {
    void appService.openImproveWindow()
    close()
  }
}

// "Open Settings" hint button: close Improve, then lazy-load settings so the
// detached Improve window never statically pulls in the main-window modules
// (sidebar/pane/…), which wire DOM listeners at import time against elements
// that only exist in index.html.
export function makeOpenSettingsClick(close: () => void): () => Promise<void> {
  return async () => {
    close()
    const { openSettings } = await import('@views/screens/settings/settings')
    openSettings()
  }
}

// ---- Improve Crafterm panel -----------------------------------------
// Overlay-mounting entry for the gea Improve panel: owns the overlay backdrop,
// keyboard shortcuts, and window-mode wiring. The `.modal.improve-modal` shell +
// its reactive content — stats, the new-feature form, and the Todo / Ready / Done
// tabs — is rendered by the gea ImprovePanel component, mounted into the overlay.
// In window mode the panel fills a standalone window.
export function showImproveModal(opts: { windowMode?: boolean } = {}): Promise<void> {
  const windowMode = !!opts.windowMode
  const { overlay, mount, close, onClose } = createOverlay({ closeOnBackdrop: !windowMode })
  if (windowMode) overlay.classList.add('improve-window-overlay')

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      // In window mode the close button shuts the host window; Esc is inert.
      if (!windowMode) close()
      return
    }
    // Cmd/Ctrl+N opens the "request new feature" form (no-op without a todo file).
    if ((e.metaKey || e.ctrlKey) && (e.key === 'n' || e.key === 'N')) {
      if (!store.hasTodoFile) return
      e.preventDefault()
      e.stopPropagation()
      store.openForm()
      return
    }
    // Cmd/Ctrl+1/2/3 switch between Todo / Ready to test / Done tabs.
    if (e.metaKey || e.ctrlKey) {
      const map: Record<string, ImproveTab> = { '1': 'todo', '2': 'ready', '3': 'done' }
      const next = map[e.key]
      if (next) {
        e.preventDefault()
        e.stopPropagation()
        store.setTab(next)
      }
    }
  }
  onClose(() => {
    document.removeEventListener('keydown', onKey, true)
    if (windowMode) window.close()
  })
  document.addEventListener('keydown', onKey, true)

  store.reset(windowMode, close)
  new ImprovePanel().render(overlay)
  mount()

  // Async load resolves the modal promise (window bootstrap awaits it) once the
  // todo store is read; the reactive panel fills in when state lands.
  return store.load()
}

export type ImproveTab = 'todo' | 'ready' | 'done'

// A list row resolved against its owning section by heading + index, so a
// mutation can address `doc.sections[heading].items[idx]` without holding a live
// section reference across reactive doc rebuilds.
export interface EntryView {
  heading: string
  idx: number
  text: string
  inProgress?: boolean
}

// Reactive state for the gea Improve Crafterm panel. The persisted source of
// truth stays the JSON store (todo-list.json); this store mirrors it into a
// reactive `doc`, deriving the tab/search lists in getters. Every mutation edits
// `doc` in place, then touch() rebuilds it so gea re-derives the lists, and the
// flattened JSON is written back through todoService (id/createdAt preserved via
// docToJson against prevItems). Replaces the legacy ImproveModalController's
// manual render() + replaceChildren() cycle.
class ImproveStore extends Store {
  windowMode = false
  onTop = false
  close: () => void = () => {}

  loaded = false
  hasTodoFile = false
  jsonPath = ''
  prevItems: TodoItemJson[] = []
  doc: TodoDoc = emptyDoc()

  searchQuery = ''
  activeTab: ImproveTab = 'todo'
  formOpen = false
  formText = ''
  editing: { heading: string; idx: number } | null = null

  // Reset all per-open state before the legacy entry mounts the panel. Called
  // with the overlay's close fn + window-mode flag so the header renders the
  // correct popout / always-on-top control and its buttons can close the modal.
  reset(windowMode: boolean, close: () => void): void {
    this.windowMode = windowMode
    this.close = close
    this.onTop = false
    this.loaded = false
    this.hasTodoFile = false
    this.jsonPath = ''
    this.prevItems = []
    this.doc = emptyDoc()
    this.searchQuery = ''
    this.activeTab = 'todo'
    this.formOpen = false
    this.formText = ''
    this.editing = null
  }

  // Load from JSON. On first run (no .json yet) migrate the legacy markdown file
  // once, then persist it as JSON. `prevItems` keeps id/createdAt stable.
  async load(): Promise<void> {
    if (!settings.todoFile) {
      this.hasTodoFile = false
      this.loaded = true
      return
    }
    this.hasTodoFile = true
    const jsonPath = todoJsonPath()
    this.jsonPath = jsonPath
    const rawJson = await todoService.read(jsonPath)
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson) as TodoFileJson
        this.prevItems = Array.isArray(parsed.items) ? parsed.items : []
        this.doc = jsonToDoc(parsed)
      } catch {
        this.doc = emptyDoc()
      }
    } else {
      const md = await todoService.read(settings.todoFile)
      this.doc = md ? parseTodo(md) : emptyDoc()
      const migrated = docToJson(this.doc, [])
      this.prevItems = migrated.items
      await todoService.write(jsonPath, JSON.stringify(migrated, null, 2))
    }
    this.loaded = true
  }

  // --- progress overview ---
  get stats(): { p: number; b: number; r: number; d: number; total: number; pct: number } {
    const p = sectionBy(this.doc, 'progress')?.items.length ?? 0
    const b = sectionBy(this.doc, 'backlog')?.items.length ?? 0
    const r = sectionBy(this.doc, 'ready')?.items.length ?? 0
    const d = sectionBy(this.doc, 'done')?.items.length ?? 0
    const total = p + b + r + d
    return { p, b, r, d, total, pct: total ? Math.round((d / total) * 100) : 0 }
  }

  // --- derived list snapshots (reactive getters; no mutation) ---
  get progEntries(): EntryView[] {
    const s = sectionBy(this.doc, 'progress')
    return s ? s.items.map((text, idx) => ({ heading: s.heading, idx, text, inProgress: true })) : []
  }
  get backEntries(): EntryView[] {
    const s = sectionBy(this.doc, 'backlog')
    return s ? s.items.map((text, idx) => ({ heading: s.heading, idx, text })) : []
  }
  get readyEntries(): EntryView[] {
    const s = sectionBy(this.doc, 'ready')
    return s ? s.items.map((text, idx) => ({ heading: s.heading, idx, text })) : []
  }
  get doneItems(): string[] {
    return sectionBy(this.doc, 'done')?.items ?? []
  }

  // --- view-state mutations ---
  setTab(tab: ImproveTab): void {
    this.activeTab = tab
  }
  setSearch(query: string): void {
    this.searchQuery = query
  }
  openForm(): void {
    this.formOpen = true
    // The textarea is rendered by the store write above, on gea's own tick — so it
    // cannot be focused synchronously here (todomrkhe5mba9).
    focusWhenReady(() => document.querySelector<HTMLTextAreaElement>('.improve-textarea'))
  }
  closeForm(): void {
    this.formOpen = false
    this.formText = ''
  }
  setFormText(value: string): void {
    this.formText = value
  }
  toggleOnTop(): void {
    this.onTop = !this.onTop
  }

  isEditing(heading: string, idx: number): boolean {
    return !!this.editing && this.editing.heading === heading && this.editing.idx === idx
  }
  beginEdit(heading: string, idx: number): void {
    this.editing = { heading, idx }
  }
  cancelEdit(): void {
    this.editing = null
  }
  commitEdit(heading: string, idx: number, value: string): void {
    // Enter + blur both fire; the first nulls `editing`, so the second is a no-op.
    if (!this.isEditing(heading, idx)) return
    this.editing = null
    const sec = this.doc.sections.find((s) => s.heading === heading)
    if (!sec) return
    const v = value.trim().replace(/\s+/g, ' ')
    if (v && v !== sec.items[idx]) {
      sec.items[idx] = v
      this.persist()
    }
  }

  // --- data mutations (persisted) ---
  // Move an item out of its section into another (top or bottom), then persist.
  moveEntry(heading: string, idx: number, targetHeading: string, toTop: boolean): void {
    const from = this.doc.sections.find((s) => s.heading === heading)
    if (!from) return
    const [item] = from.items.splice(idx, 1)
    if (item == null) return
    const target = ensureSection(this.doc, targetHeading)
    if (toTop) target.items.unshift(item)
    else target.items.push(item)
    this.persist()
  }

  // Drag-to-reorder backlog priority (file order is the AI's work order).
  reorderBacklog(from: number, to: number): void {
    const backlog = sectionBy(this.doc, 'backlog')
    if (!backlog || from === to) return
    const [moved] = backlog.items.splice(from, 1)
    if (moved == null) return
    backlog.items.splice(to, 0, moved)
    this.persist()
  }

  clearDone(): void {
    const done = sectionBy(this.doc, 'done')
    if (!done) return
    done.items = []
    this.persist()
  }

  submitFeature(): void {
    const text = this.formText.trim().replace(/\s+/g, ' ')
    if (!text) return
    ensureSection(this.doc, 'Backlog').items.push(text)
    this.formOpen = false
    this.formText = ''
    this.persist()
  }

  // Rebuild `doc` (new section + item array refs) so gea re-derives the list
  // getters, then flush the flattened JSON to disk.
  private persist(): void {
    this.touch()
    void this.save()
  }
  private touch(): void {
    this.doc = {
      preamble: this.doc.preamble,
      sections: this.doc.sections.map((s) => ({ heading: s.heading, items: [...s.items] }))
    }
  }
  private save = async (): Promise<boolean> => {
    const file = docToJson(this.doc, this.prevItems)
    this.prevItems = file.items
    return todoService.write(this.jsonPath, JSON.stringify(file, null, 2))
  }
}

const store = new ImproveStore()
export default store
