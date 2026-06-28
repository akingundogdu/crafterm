import { Store } from '@geajs/core'
import { settings } from '@ui/state/state'
import { todoService } from '@services'
import {
  type TodoDoc,
  type TodoItemJson,
  type TodoFileJson,
  emptyDoc,
  jsonToDoc,
  parseTodo,
  sectionBy,
  ensureSection
} from '@ui/screens/improve-crafterm/todo-doc'
import { todoJsonPath, docToJson } from '@ui/screens/improve-crafterm/improve-crafterm.state'

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

export default new ImproveStore()
