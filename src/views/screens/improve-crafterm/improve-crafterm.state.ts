import { settings, uid } from '@views/state/spine'
import { appService } from '@services'
import { createOverlay } from '@views/components/overlay/overlay'
import { type TodoDoc, type TodoItemJson, type TodoFileJson } from './todo-doc'
import store, { type ImproveTab } from './improve-crafterm.store'
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
