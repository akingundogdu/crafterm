import { settings } from '@ui/state/state'
import { makeCloseButton, promptConfirm } from '@ui/components/dialog/dialog'
import { todoService } from '@services'
import { createOverlay } from '@ui/components'
import {
  type Section,
  type TodoDoc,
  type TodoItemJson,
  type TodoFileJson,
  emptyDoc,
  jsonToDoc,
  parseTodo,
  sectionBy,
  ensureSection,
  splitOrder
} from './todo-doc'
import type { Entry, RowAction } from './improve-crafterm.types'
import {
  todoJsonPath,
  docToJson,
  makePopoutClick,
  makeOnTopClick,
  makeOpenSettingsClick
} from './improve-crafterm.state'
import { buildTodoRow, type TodoRowOptions } from './components/todo-row'
import { fillTodoList } from './components/todo-list-section'

// ---- Improve Crafterm panel -----------------------------------------
// Owns the Improve Crafterm modal: builds the overlay/header/form/columns,
// loads the todo JSON store, and renders the Todo / Ready / Done tabs. All
// methods are arrow methods so `this` stays bound when passed as callbacks.
export class ImproveModalController {
  private readonly windowMode: boolean

  private overlay!: HTMLDivElement
  private modal!: HTMLDivElement
  private close!: () => void

  private reqBtn!: HTMLButtonElement
  private searchInput!: HTMLInputElement
  private searchQuery = ''

  private stats!: HTMLDivElement
  private cols!: HTMLDivElement
  private ta!: HTMLTextAreaElement
  private saveBtn!: HTMLButtonElement
  private cancelBtn!: HTMLButtonElement
  private form!: HTMLDivElement

  private jsonPath = ''
  private prevItems: TodoItemJson[] = []
  private doc!: TodoDoc

  // Which tab is shown in the single wide panel.
  private activeTab: 'todo' | 'ready' | 'done' = 'todo'

  constructor(opts: { windowMode?: boolean } = {}) {
    this.windowMode = !!opts.windowMode
  }

  run = async (): Promise<void> => {
    const windowMode = this.windowMode
    const { overlay, mount, close, onClose } = createOverlay({ closeOnBackdrop: !windowMode })
    this.overlay = overlay as HTMLDivElement
    this.close = close
    if (windowMode) overlay.classList.add('improve-window-overlay')
    const modal = (<div class="modal improve-modal" />) as HTMLDivElement
    this.modal = modal
    overlay.appendChild(modal)
    // In window mode the close button shuts the host window; Esc is inert.
    onClose(() => {
      document.removeEventListener('keydown', this.onKey, true)
      if (windowMode) window.close()
    })
    document.addEventListener('keydown', this.onKey, true)
    modal.appendChild(makeCloseButton(close))
    mount()

    // header: title + search box + request-new-feature button
    const searchInput = (
      <input type="text" class="improve-search" placeholder="Search Todo / Ready / Done…" />
    ) as HTMLInputElement
    this.searchInput = searchInput
    const reqBtn = (<button class="settings-inline-btn">+ Request new feature</button>) as HTMLButtonElement
    this.reqBtn = reqBtn
    const head = (
      <div class="improve-head">
        <h2>Improve Crafterm</h2>
        {searchInput}
      </div>
    ) as HTMLDivElement
    // "Open in window" detaches Improve into a standalone always-available window
    // (e.g. on a second monitor). Hidden when already running in window mode.
    if (!windowMode) {
      const popBtn = (
        <button
          class="settings-inline-btn improve-popout-btn"
          title="Open Improve Crafterm in its own window"
          onClick={makePopoutClick(close)}
        >
          ⤢ Open in window
        </button>
      ) as HTMLButtonElement
      head.append(popBtn)
    } else {
      // In window mode, offer an always-on-top toggle instead.
      const topBtn = (
        <button class="settings-inline-btn improve-ontop-btn">📌 Always on top</button>
      ) as HTMLButtonElement
      topBtn.addEventListener('click', makeOnTopClick(topBtn))
      head.append(topBtn)
    }
    head.append(reqBtn)
    modal.appendChild(head)
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value.trim().toLowerCase()
      this.render()
    })
    // Stop keydown bubbling so the global handler doesn't fire shortcuts while
    // typing in the search box. Local Esc clears the query first, then closes.
    searchInput.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') {
        if (this.searchQuery) {
          searchInput.value = ''
          this.searchQuery = ''
          this.render()
        } else {
          close()
        }
      }
    })

    if (!settings.todoFile) {
      const hint = (
        <div class="empty-hint" innerHTML="Set the todo list file in Settings → Workspace first." />
      ) as HTMLDivElement
      const open = (
        <button class="settings-inline-btn" onClick={makeOpenSettingsClick(close)}>
          Open Settings
        </button>
      ) as HTMLButtonElement
      modal.append(hint, open)
      reqBtn.disabled = true
      return
    }

    // Load from JSON. On first run (no .json yet) migrate the legacy markdown
    // file once, then persist it as JSON. `prevItems` keeps id/createdAt stable.
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
      // Migrate legacy markdown (if any) into the JSON store.
      const md = await todoService.read(settings.todoFile)
      this.doc = md ? parseTodo(md) : emptyDoc()
      const migrated = docToJson(this.doc, [])
      this.prevItems = migrated.items
      await todoService.write(jsonPath, JSON.stringify(migrated, null, 2))
    }

    // progress overview (counts + bar), refreshed on every render
    const stats = (<div class="improve-stats" />) as HTMLDivElement
    this.stats = stats
    modal.appendChild(stats)

    // new-feature form (hidden until requested)
    const ta = (
      <textarea class="improve-textarea" placeholder="Describe the feature you want…" rows={3} />
    ) as HTMLTextAreaElement
    this.ta = ta
    const saveBtn = (<button class="settings-inline-btn">Save</button>) as HTMLButtonElement
    this.saveBtn = saveBtn
    const cancelBtn = (<button class="improve-cancel">Cancel</button>) as HTMLButtonElement
    this.cancelBtn = cancelBtn
    const form = (
      <div class="improve-form" style={{ display: 'none' }}>
        {ta}
        <div class="improve-form-actions">
          {saveBtn}
          {cancelBtn}
        </div>
      </div>
    ) as HTMLDivElement
    this.form = form
    modal.appendChild(form)

    const cols = (<div class="improve-cols" />) as HTMLDivElement
    this.cols = cols
    modal.appendChild(cols)

    // Footer status bar: show the path of the todo file so the user can see
    // which file is being edited (and copy it out if needed).
    const foot = (
      <div class="improve-foot">
        <span class="improve-foot-label">todo file</span>
        <span class="improve-foot-path" title={jsonPath}>
          {jsonPath}
        </span>
      </div>
    ) as HTMLDivElement
    modal.appendChild(foot)

    reqBtn.addEventListener('click', this.openFeatureForm)
    cancelBtn.addEventListener('click', () => {
      ta.value = ''
      form.style.display = 'none'
    })
    saveBtn.addEventListener('click', this.submitFeature)
    // Cmd/Ctrl+Enter saves the new feature without reaching for the button.
    ta.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        this.submitFeature()
      }
    })

    this.render()
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      if (!this.windowMode) this.close()
      return
    }
    // Cmd/Ctrl+N opens the "request new feature" form (no-op if unavailable).
    if ((e.metaKey || e.ctrlKey) && (e.key === 'n' || e.key === 'N')) {
      if (this.reqBtn.disabled) return
      e.preventDefault()
      e.stopPropagation()
      this.openFeatureForm()
      return
    }
    // Cmd/Ctrl+1/2/3 switch between Todo / Ready to test / Done tabs.
    if (e.metaKey || e.ctrlKey) {
      const map: Record<string, 'todo' | 'ready' | 'done'> = { '1': 'todo', '2': 'ready', '3': 'done' }
      const next = map[e.key]
      if (next) {
        e.preventDefault()
        e.stopPropagation()
        this.activeTab = next
        this.render()
      }
    }
  }

  private openFeatureForm = (): void => {
    this.form.style.display = 'block'
    this.ta.focus()
  }

  // Persist: flatten the working model to JSON (keeping ids/timestamps) and
  // remember the result so the next save can match items by id again.
  private save = async (): Promise<boolean> => {
    const file = docToJson(this.doc, this.prevItems)
    this.prevItems = file.items
    return todoService.write(this.jsonPath, JSON.stringify(file, null, 2))
  }

  // Move an item out of its section into another (top or bottom), then persist.
  private moveEntry = async (entry: Entry, targetHeading: string, toTop: boolean): Promise<void> => {
    const [item] = entry.section.items.splice(entry.idx, 1)
    const target = ensureSection(this.doc, targetHeading)
    if (toTop) target.items.unshift(item)
    else target.items.push(item)
    await this.save()
    this.render()
  }

  // Replace a row's text with an editable input; commit on Enter/blur, cancel on Esc.
  private beginEdit = (entry: Entry, row: HTMLElement): void => {
    const input = (<input class="improve-edit-input" value={entry.text} />) as HTMLInputElement
    row.replaceChildren(input)
    input.focus()
    input.select()
    let settled = false
    const commit = async (keep: boolean): Promise<void> => {
      if (settled) return
      settled = true
      if (keep) {
        const v = input.value.trim().replace(/\s+/g, ' ')
        if (v && v !== entry.text) {
          entry.section.items[entry.idx] = v
          await this.save()
        }
      }
      this.render()
    }
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') void commit(true)
      else if (e.key === 'Escape') void commit(false)
    })
    input.addEventListener('blur', () => void commit(true))
  }

  private makeRow = (entry: Entry, opts: TodoRowOptions): HTMLElement => buildTodoRow(entry, opts, this.beginEdit)

  // Small uppercase divider used inside the Todo list to separate the
  // "in progress" group from the "up next" (backlog) group.
  private addSubhead = (list: HTMLElement, label: string): void => {
    list.appendChild(<div class="improve-subhead">{label}</div>)
  }

  private renderStats = (): void => {
    const p = sectionBy(this.doc, 'progress')?.items.length ?? 0
    const b = sectionBy(this.doc, 'backlog')?.items.length ?? 0
    const r = sectionBy(this.doc, 'ready')?.items.length ?? 0
    const d = sectionBy(this.doc, 'done')?.items.length ?? 0
    const total = p + b + r + d
    const pct = total ? Math.round((d / total) * 100) : 0
    this.stats.replaceChildren()
    const counts = (<div class="improve-stats-counts" />) as HTMLDivElement
    const chip = (n: number, label: string, cls: string): void => {
      counts.appendChild(<span class={'improve-stat ' + cls} innerHTML={`<b>${n}</b> ${label}`} />)
    }
    chip(p, 'in progress', 'st-prog')
    chip(b, 'backlog', 'st-back')
    chip(r, 'ready to test', 'st-ready')
    chip(d, 'done', 'st-done')
    counts.appendChild(<span class="improve-stats-pct">{`${pct}% done`}</span>)
    const bar = (
      <div class="improve-progress">
        <div class="improve-progress-fill" style={{ width: pct + '%' }} />
      </div>
    ) as HTMLDivElement
    this.stats.append(counts, bar)
  }

  // Render the Todo list (in-progress + backlog, with drag-to-reorder) into `list`.
  private fillTodo = (list: HTMLElement, progEntries: Entry[], backEntries: Entry[], backlog?: Section): void =>
    fillTodoList(list, progEntries, backEntries, backlog, {
      buildRow: this.makeRow,
      addSubhead: this.addSubhead,
      moveEntry: this.moveEntry,
      save: this.save,
      render: this.render
    })

  private render = (): void => {
    this.renderStats()
    this.cols.replaceChildren()
    const progress = sectionBy(this.doc, 'progress')
    const backlog = sectionBy(this.doc, 'backlog')
    const ready = sectionBy(this.doc, 'ready') // "Ready to test"
    const done = sectionBy(this.doc, 'done')

    const progEntries: Entry[] = []
    const backEntries: Entry[] = []
    if (progress) progress.items.forEach((text, idx) => progEntries.push({ section: progress, idx, text, inProgress: true }))
    if (backlog) backlog.items.forEach((text, idx) => backEntries.push({ section: backlog, idx, text }))
    const todoCount = progEntries.length + backEntries.length
    const readyItems: Entry[] = []
    if (ready) ready.items.forEach((text, idx) => readyItems.push({ section: ready, idx, text }))
    const doneItems = done?.items ?? []

    // Search mode: a non-empty query shows all three sections stacked, each
    // filtered to matching items. Tabs are hidden — section headers are the
    // only navigation. Clearing the input restores tab mode.
    if (this.searchQuery) {
      const matches = (text: string): boolean => text.toLowerCase().includes(this.searchQuery)
      const filteredProg = progEntries.filter((e) => matches(e.text))
      const filteredBack = backEntries.filter((e) => matches(e.text))
      const filteredReady = readyItems.filter((e) => matches(e.text))
      const filteredDone = doneItems
        .map((text, i) => ({ text, i }))
        .filter((x) => matches(x.text))
      const totalMatches = filteredProg.length + filteredBack.length + filteredReady.length + filteredDone.length

      this.cols.appendChild(
        <div class="improve-search-summary">
          {`${totalMatches} match${totalMatches === 1 ? '' : 'es'} for "${this.searchQuery}"`}
        </div>
      )

      const renderSection = (label: string, count: number, build: (sec: HTMLElement) => void): void => {
        const sec = (
          <div class="improve-search-section">
            <div class="improve-search-head">{`${label} · ${count}`}</div>
          </div>
        ) as HTMLDivElement
        if (count === 0) {
          sec.appendChild(<div class="empty-hint">No matches</div>)
        } else build(sec)
        this.cols.appendChild(sec)
      }

      const doneAction = (entry: Entry): RowAction => ({
        icon: '✓', title: 'Mark done', cls: 'mark-done',
        run: () => this.moveEntry(entry, 'Done', true)
      })
      renderSection('Todo', filteredProg.length + filteredBack.length, (sec) => {
        filteredProg.forEach((e, i) => sec.appendChild(this.makeRow(e, { editable: true, orderNum: i + 1, actions: [doneAction(e)] })))
        filteredBack.forEach((e, i) => sec.appendChild(this.makeRow(e, { editable: true, orderNum: i + 1, actions: [doneAction(e)] })))
      })
      renderSection('Ready to test', filteredReady.length, (sec) => {
        filteredReady.forEach((entry, i) =>
          sec.appendChild(
            this.makeRow(entry, {
              editable: true, orderNum: i + 1,
              actions: [
                { icon: '↩', title: 'Reopen (back to Backlog)', cls: 'reopen', run: () => this.moveEntry(entry, 'Backlog', false) },
                { icon: '✓', title: 'Approve (mark done)', cls: 'mark-done', run: () => this.moveEntry(entry, 'Done', true) }
              ]
            })
          )
        )
      })
      renderSection('Done', filteredDone.length, (sec) => {
        filteredDone.forEach((x, i) => {
          sec.appendChild(
            <div class="improve-item done">
              <span class="improve-order">{String(i + 1)}</span>
              <span class="improve-tick">✓</span>
              <span class="improve-item-text">{splitOrder(x.text).body}</span>
            </div>
          )
        })
      })
      return
    }

    // --- tab bar: one wide panel at a time, easier to read long ideas ---
    const tabs = (<div class="improve-tabs" />) as HTMLDivElement
    const mkTab = (key: typeof this.activeTab, label: string, count: number): void => {
      const b = (
        <button
          type="button"
          class={'improve-tab' + (this.activeTab === key ? ' active' : '')}
          onClick={() => {
            this.activeTab = key
            this.render()
          }}
        >
          {label + ' '}
          <span class="improve-tab-count">{String(count)}</span>
        </button>
      ) as HTMLButtonElement
      tabs.appendChild(b)
    }
    mkTab('todo', 'Todo', todoCount)
    mkTab('ready', 'Ready to test', readyItems.length)
    mkTab('done', 'Done', doneItems.length)
    this.cols.appendChild(tabs)

    // "Clear all" toolbar only on the Done tab when there's something to clear
    if (this.activeTab === 'done' && doneItems.length) {
      const clearBtn = (
        <button
          class="improve-clear-done"
          type="button"
          title="Remove all done items from todo-list.md"
          onClick={async () => {
            const ok = await promptConfirm({
              title: 'Clear done items',
              message: `Remove all ${doneItems.length} done item(s)? This rewrites todo-list.md.`,
              confirmText: 'Clear all'
            })
            if (!ok) return
            if (done) done.items = []
            await this.save()
            this.render()
          }}
        >
          Clear all
        </button>
      ) as HTMLButtonElement
      const toolbar = (<div class="improve-panel-toolbar" />) as HTMLDivElement
      toolbar.appendChild(clearBtn)
      this.cols.appendChild(toolbar)
    }

    const list = (<div class="improve-list improve-panel" />) as HTMLDivElement
    this.cols.appendChild(list)

    const empty = (): void => {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">Nothing here</div>')
    }

    if (this.activeTab === 'todo') {
      if (todoCount === 0) empty()
      else this.fillTodo(list, progEntries, backEntries, backlog)
    } else if (this.activeTab === 'ready') {
      if (!readyItems.length) empty()
      else
        readyItems.forEach((entry, i) =>
          list.appendChild(
            this.makeRow(entry, {
              editable: true,
              orderNum: i + 1,
              actions: [
                { icon: '↩', title: 'Reopen (back to Backlog)', cls: 'reopen', run: () => this.moveEntry(entry, 'Backlog', false) },
                { icon: '✓', title: 'Approve (mark done)', cls: 'mark-done', run: () => this.moveEntry(entry, 'Done', true) }
              ]
            })
          )
        )
    } else {
      if (!doneItems.length) empty()
      else
        doneItems.forEach((text, i) => {
          list.appendChild(
            <div class="improve-item done">
              <span class="improve-order">{String(i + 1)}</span>
              <span class="improve-tick">✓</span>
              <span class="improve-item-text">{splitOrder(text).body}</span>
            </div>
          )
        })
    }
  }

  private submitFeature = async (): Promise<void> => {
    const text = this.ta.value.trim().replace(/\s+/g, ' ')
    if (!text) return
    ensureSection(this.doc, 'Backlog').items.push(text)
    await this.save()
    this.ta.value = ''
    this.form.style.display = 'none'
    this.render()
  }
}
