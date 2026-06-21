import './improve-crafterm.css'
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

export async function showImproveModal(opts: { windowMode?: boolean } = {}): Promise<void> {
  const windowMode = !!opts.windowMode
  const { overlay, mount, close, onClose } = createOverlay({ closeOnBackdrop: !windowMode })
  if (windowMode) overlay.classList.add('improve-window-overlay')
  const modal = (<div class="modal improve-modal" />) as HTMLDivElement
  overlay.appendChild(modal)
  // In window mode the close button shuts the host window; Esc is inert.
  onClose(() => {
    document.removeEventListener('keydown', onKey, true)
    if (windowMode) window.close()
  })
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      if (!windowMode) close()
      return
    }
    // Cmd/Ctrl+N opens the "request new feature" form (no-op if unavailable).
    if ((e.metaKey || e.ctrlKey) && (e.key === 'n' || e.key === 'N')) {
      if (reqBtn.disabled) return
      e.preventDefault()
      e.stopPropagation()
      openFeatureForm()
      return
    }
    // Cmd/Ctrl+1/2/3 switch between Todo / Ready to test / Done tabs.
    if (e.metaKey || e.ctrlKey) {
      const map: Record<string, 'todo' | 'ready' | 'done'> = { '1': 'todo', '2': 'ready', '3': 'done' }
      const next = map[e.key]
      if (next) {
        e.preventDefault()
        e.stopPropagation()
        activeTab = next
        render()
      }
    }
  }
  document.addEventListener('keydown', onKey, true)
  modal.appendChild(makeCloseButton(close))
  mount()

  // header: title + search box + request-new-feature button
  const searchInput = (
    <input type="text" class="improve-search" placeholder="Search Todo / Ready / Done…" />
  ) as HTMLInputElement
  const reqBtn = (<button class="settings-inline-btn">+ Request new feature</button>) as HTMLButtonElement
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
  let searchQuery = ''
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase()
    render()
  })
  // Stop keydown bubbling so the global handler doesn't fire shortcuts while
  // typing in the search box. Local Esc clears the query first, then closes.
  searchInput.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      if (searchQuery) {
        searchInput.value = ''
        searchQuery = ''
        render()
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
  let prevItems: TodoItemJson[] = []
  let doc: TodoDoc
  const rawJson = await todoService.read(jsonPath)
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as TodoFileJson
      prevItems = Array.isArray(parsed.items) ? parsed.items : []
      doc = jsonToDoc(parsed)
    } catch {
      doc = emptyDoc()
    }
  } else {
    // Migrate legacy markdown (if any) into the JSON store.
    const md = await todoService.read(settings.todoFile)
    doc = md ? parseTodo(md) : emptyDoc()
    const migrated = docToJson(doc, [])
    prevItems = migrated.items
    await todoService.write(jsonPath, JSON.stringify(migrated, null, 2))
  }

  // progress overview (counts + bar), refreshed on every render
  const stats = (<div class="improve-stats" />) as HTMLDivElement
  modal.appendChild(stats)

  // new-feature form (hidden until requested)
  const ta = (
    <textarea class="improve-textarea" placeholder="Describe the feature you want…" rows={3} />
  ) as HTMLTextAreaElement
  const saveBtn = (<button class="settings-inline-btn">Save</button>) as HTMLButtonElement
  const cancelBtn = (<button class="improve-cancel">Cancel</button>) as HTMLButtonElement
  const form = (
    <div class="improve-form" style={{ display: 'none' }}>
      {ta}
      <div class="improve-form-actions">
        {saveBtn}
        {cancelBtn}
      </div>
    </div>
  ) as HTMLDivElement
  modal.appendChild(form)

  function openFeatureForm(): void {
    form.style.display = 'block'
    ta.focus()
  }

  const cols = (<div class="improve-cols" />) as HTMLDivElement
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

  // Persist: flatten the working model to JSON (keeping ids/timestamps) and
  // remember the result so the next save can match items by id again.
  const save = async (): Promise<boolean> => {
    const file = docToJson(doc, prevItems)
    prevItems = file.items
    return todoService.write(jsonPath, JSON.stringify(file, null, 2))
  }

  // Move an item out of its section into another (top or bottom), then persist.
  const moveEntry = async (entry: Entry, targetHeading: string, toTop: boolean): Promise<void> => {
    const [item] = entry.section.items.splice(entry.idx, 1)
    const target = ensureSection(doc, targetHeading)
    if (toTop) target.items.unshift(item)
    else target.items.push(item)
    await save()
    render()
  }

  // Replace a row's text with an editable input; commit on Enter/blur, cancel on Esc.
  const beginEdit = (entry: Entry, row: HTMLElement): void => {
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
          await save()
        }
      }
      render()
    }
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') void commit(true)
      else if (e.key === 'Escape') void commit(false)
    })
    input.addEventListener('blur', () => void commit(true))
  }

  const makeRow = (entry: Entry, opts: TodoRowOptions): HTMLElement => buildTodoRow(entry, opts, beginEdit)

  // Which tab is shown in the single wide panel.
  let activeTab: 'todo' | 'ready' | 'done' = 'todo'

  // Small uppercase divider used inside the Todo list to separate the
  // "in progress" group from the "up next" (backlog) group.
  const addSubhead = (list: HTMLElement, label: string): void => {
    list.appendChild(<div class="improve-subhead">{label}</div>)
  }

  const renderStats = (): void => {
    const p = sectionBy(doc, 'progress')?.items.length ?? 0
    const b = sectionBy(doc, 'backlog')?.items.length ?? 0
    const r = sectionBy(doc, 'ready')?.items.length ?? 0
    const d = sectionBy(doc, 'done')?.items.length ?? 0
    const total = p + b + r + d
    const pct = total ? Math.round((d / total) * 100) : 0
    stats.replaceChildren()
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
    stats.append(counts, bar)
  }

  // Render the Todo list (in-progress + backlog, with drag-to-reorder) into `list`.
  const fillTodo = (list: HTMLElement, progEntries: Entry[], backEntries: Entry[], backlog?: Section): void =>
    fillTodoList(list, progEntries, backEntries, backlog, {
      buildRow: makeRow,
      addSubhead,
      moveEntry,
      save,
      render
    })

  const render = (): void => {
    renderStats()
    cols.replaceChildren()
    const progress = sectionBy(doc, 'progress')
    const backlog = sectionBy(doc, 'backlog')
    const ready = sectionBy(doc, 'ready') // "Ready to test"
    const done = sectionBy(doc, 'done')

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
    if (searchQuery) {
      const matches = (text: string): boolean => text.toLowerCase().includes(searchQuery)
      const filteredProg = progEntries.filter((e) => matches(e.text))
      const filteredBack = backEntries.filter((e) => matches(e.text))
      const filteredReady = readyItems.filter((e) => matches(e.text))
      const filteredDone = doneItems
        .map((text, i) => ({ text, i }))
        .filter((x) => matches(x.text))
      const totalMatches = filteredProg.length + filteredBack.length + filteredReady.length + filteredDone.length

      cols.appendChild(
        <div class="improve-search-summary">
          {`${totalMatches} match${totalMatches === 1 ? '' : 'es'} for "${searchQuery}"`}
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
        cols.appendChild(sec)
      }

      const doneAction = (entry: Entry): RowAction => ({
        icon: '✓', title: 'Mark done', cls: 'mark-done',
        run: () => moveEntry(entry, 'Done', true)
      })
      renderSection('Todo', filteredProg.length + filteredBack.length, (sec) => {
        filteredProg.forEach((e, i) => sec.appendChild(makeRow(e, { editable: true, orderNum: i + 1, actions: [doneAction(e)] })))
        filteredBack.forEach((e, i) => sec.appendChild(makeRow(e, { editable: true, orderNum: i + 1, actions: [doneAction(e)] })))
      })
      renderSection('Ready to test', filteredReady.length, (sec) => {
        filteredReady.forEach((entry, i) =>
          sec.appendChild(
            makeRow(entry, {
              editable: true, orderNum: i + 1,
              actions: [
                { icon: '↩', title: 'Reopen (back to Backlog)', cls: 'reopen', run: () => moveEntry(entry, 'Backlog', false) },
                { icon: '✓', title: 'Approve (mark done)', cls: 'mark-done', run: () => moveEntry(entry, 'Done', true) }
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
    const mkTab = (key: typeof activeTab, label: string, count: number): void => {
      const b = (
        <button
          type="button"
          class={'improve-tab' + (activeTab === key ? ' active' : '')}
          onClick={() => {
            activeTab = key
            render()
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
    cols.appendChild(tabs)

    // "Clear all" toolbar only on the Done tab when there's something to clear
    if (activeTab === 'done' && doneItems.length) {
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
            await save()
            render()
          }}
        >
          Clear all
        </button>
      ) as HTMLButtonElement
      const toolbar = (<div class="improve-panel-toolbar" />) as HTMLDivElement
      toolbar.appendChild(clearBtn)
      cols.appendChild(toolbar)
    }

    const list = (<div class="improve-list improve-panel" />) as HTMLDivElement
    cols.appendChild(list)

    const empty = (): void => {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">Nothing here</div>')
    }

    if (activeTab === 'todo') {
      if (todoCount === 0) empty()
      else fillTodo(list, progEntries, backEntries, backlog)
    } else if (activeTab === 'ready') {
      if (!readyItems.length) empty()
      else
        readyItems.forEach((entry, i) =>
          list.appendChild(
            makeRow(entry, {
              editable: true,
              orderNum: i + 1,
              actions: [
                { icon: '↩', title: 'Reopen (back to Backlog)', cls: 'reopen', run: () => moveEntry(entry, 'Backlog', false) },
                { icon: '✓', title: 'Approve (mark done)', cls: 'mark-done', run: () => moveEntry(entry, 'Done', true) }
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

  reqBtn.addEventListener('click', openFeatureForm)
  cancelBtn.addEventListener('click', () => {
    ta.value = ''
    form.style.display = 'none'
  })
  const submitFeature = async (): Promise<void> => {
    const text = ta.value.trim().replace(/\s+/g, ' ')
    if (!text) return
    ensureSection(doc, 'Backlog').items.push(text)
    await save()
    ta.value = ''
    form.style.display = 'none'
    render()
  }
  saveBtn.addEventListener('click', submitFeature)
  // Cmd/Ctrl+Enter saves the new feature without reaching for the button.
  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      submitFeature()
    }
  })

  render()
}
