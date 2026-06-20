import { settings, uid } from '@ui/state/state'
import { makeCloseButton } from '@ui/dialog/dialog'
import { appService } from '@services'
import { createOverlay } from '@ui/components'
import { type TodoDoc, type TodoItemJson, type TodoFileJson } from './todo-doc'

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
  const modal = document.createElement('div')
  modal.className = 'modal improve-detail-modal'
  overlay.appendChild(modal)
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  onClose(() => document.removeEventListener('keydown', onKey, true))
  document.addEventListener('keydown', onKey, true)
  modal.appendChild(makeCloseButton(close))
  const h = document.createElement('h2')
  h.textContent = 'Item detail'
  modal.appendChild(h)
  const body = document.createElement('div')
  body.className = 'improve-detail-body'
  body.textContent = fullText
  modal.appendChild(body)
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

// Always-on-top toggle (window mode only): flips the state, reflects it on the
// button, and forwards the new value to the host window.
export function makeOnTopClick(btn: HTMLButtonElement): () => void {
  let onTop = false
  return () => {
    onTop = !onTop
    btn.classList.toggle('active', onTop)
    void appService.improveWindowSetAlwaysOnTop(onTop)
  }
}

// "Open Settings" hint button: close Improve, then lazy-load settings so the
// detached Improve window never statically pulls in the main-window modules
// (sidebar/pane/…), which wire DOM listeners at import time against elements
// that only exist in index.html.
export function makeOpenSettingsClick(close: () => void): () => Promise<void> {
  return async () => {
    close()
    const { openSettings } = await import('../settings/settings')
    openSettings()
  }
}
