import { settings } from './state'
import { openSettings } from './settings'
import { makeCloseButton, promptConfirm } from './dialog'

// ---- todo-list.md parsing / serialization -------------------------------
// The file is a human-editable markdown doc with `## Section` headings and
// `*   item` bullets. We keep the preamble (title/intro) verbatim and only
// reflow the sections we manage.

interface Section {
  heading: string
  items: string[]
}
interface TodoDoc {
  preamble: string
  sections: Section[]
}

const SECTION_RE = /^##\s+(.*)$/
const BULLET_RE = /^\s*[*-]\s+(.+?)\s*$/

function parseTodo(raw: string): TodoDoc {
  const lines = raw.split('\n')
  let i = 0
  const pre: string[] = []
  while (i < lines.length && !SECTION_RE.test(lines[i])) pre.push(lines[i++])
  const sections: Section[] = []
  let cur: Section | null = null
  for (; i < lines.length; i++) {
    const head = lines[i].match(SECTION_RE)
    if (head) {
      cur = { heading: head[1].trim(), items: [] }
      sections.push(cur)
      continue
    }
    const bullet = lines[i].match(BULLET_RE)
    if (bullet && cur) {
      const text = bullet[1].trim()
      // skip italic placeholders like _(nothing right now)_
      if (text && !/^_.*_$/.test(text)) cur.items.push(text)
    }
  }
  return { preamble: pre.join('\n'), sections }
}

function serializeTodo(doc: TodoDoc): string {
  let out = doc.preamble.replace(/\s*$/, '') + '\n\n'
  doc.sections.forEach((s, idx) => {
    out += `## ${s.heading}\n\n`
    out += s.items.length ? s.items.map((t) => `*   ${t}`).join('\n\n') + '\n' : '_(nothing right now)_\n'
    if (idx < doc.sections.length - 1) out += '\n'
  })
  return out
}

function emptyDoc(): TodoDoc {
  return {
    preamble: '# crafterm — Todo List',
    sections: [
      { heading: 'In progress', items: [] },
      { heading: 'Backlog', items: [] },
      { heading: 'Done', items: [] }
    ]
  }
}

function sectionBy(doc: TodoDoc, kw: string): Section | undefined {
  return doc.sections.find((s) => s.heading.toLowerCase().includes(kw))
}
function ensureSection(doc: TodoDoc, heading: string): Section {
  const found = doc.sections.find((s) => s.heading.toLowerCase() === heading.toLowerCase())
  if (found) return found
  const s: Section = { heading, items: [] }
  doc.sections.push(s)
  return s
}

// Items carry a leading priority number in the file (e.g. "1. add a button").
// We surface that number as a badge and show the rest as the readable text.
function splitOrder(text: string): { num: string | null; body: string } {
  const m = text.match(/^(\d+)[.)]\s+(.+)$/s)
  if (m) return { num: m[1], body: m[2].trim() }
  return { num: null, body: text }
}

// Open a read-only detail modal that shows a single backlog/ready/done entry
// in full — used when a one-line row gets truncated and the user needs to
// read the whole thing.
function showDetail(fullText: string): void {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal improve-detail-modal'
  overlay.appendChild(modal)
  const close = (): void => {
    document.removeEventListener('keydown', onKey, true)
    overlay.remove()
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  document.addEventListener('keydown', onKey, true)
  modal.appendChild(makeCloseButton(close))
  const h = document.createElement('h2')
  h.textContent = 'Item detail'
  modal.appendChild(h)
  const body = document.createElement('div')
  body.className = 'improve-detail-body'
  body.textContent = fullText
  modal.appendChild(body)
  document.body.appendChild(overlay)
}

// ---- Improve Crafterm panel -----------------------------------------

export async function showImproveModal(): Promise<void> {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal improve-modal'
  overlay.appendChild(modal)
  const close = (): void => {
    document.removeEventListener('keydown', onKey, true)
    overlay.remove()
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close()
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
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  document.addEventListener('keydown', onKey, true)
  modal.appendChild(makeCloseButton(close))
  document.body.appendChild(overlay)

  // header: title + request-new-feature button
  const head = document.createElement('div')
  head.className = 'improve-head'
  const h = document.createElement('h2')
  h.textContent = 'Improve Crafterm'
  const reqBtn = document.createElement('button')
  reqBtn.className = 'settings-inline-btn'
  reqBtn.textContent = '+ Request new feature'
  head.append(h, reqBtn)
  modal.appendChild(head)

  if (!settings.todoFile) {
    const hint = document.createElement('div')
    hint.className = 'empty-hint'
    hint.innerHTML = 'Set the todo list file in Settings → Workspace first.'
    const open = document.createElement('button')
    open.className = 'settings-inline-btn'
    open.textContent = 'Open Settings'
    open.addEventListener('click', () => {
      close()
      openSettings()
    })
    modal.append(hint, open)
    reqBtn.disabled = true
    return
  }

  const raw = await window.crafterm.todoRead(settings.todoFile)
  const doc = raw ? parseTodo(raw) : emptyDoc()

  // progress overview (counts + bar), refreshed on every render
  const stats = document.createElement('div')
  stats.className = 'improve-stats'
  modal.appendChild(stats)

  // new-feature form (hidden until requested)
  const form = document.createElement('div')
  form.className = 'improve-form'
  form.style.display = 'none'
  const ta = document.createElement('textarea')
  ta.className = 'improve-textarea'
  ta.placeholder = 'Describe the feature you want…'
  ta.rows = 3
  const formActions = document.createElement('div')
  formActions.className = 'improve-form-actions'
  const saveBtn = document.createElement('button')
  saveBtn.className = 'settings-inline-btn'
  saveBtn.textContent = 'Save'
  const cancelBtn = document.createElement('button')
  cancelBtn.className = 'improve-cancel'
  cancelBtn.textContent = 'Cancel'
  formActions.append(saveBtn, cancelBtn)
  form.append(ta, formActions)
  modal.appendChild(form)

  function openFeatureForm(): void {
    form.style.display = 'block'
    ta.focus()
  }

  const cols = document.createElement('div')
  cols.className = 'improve-cols'
  modal.appendChild(cols)

  // Footer status bar: show the path of the todo file so the user can see
  // which file is being edited (and copy it out if needed).
  const foot = document.createElement('div')
  foot.className = 'improve-foot'
  const footLabel = document.createElement('span')
  footLabel.className = 'improve-foot-label'
  footLabel.textContent = 'todo file'
  const footPath = document.createElement('span')
  footPath.className = 'improve-foot-path'
  footPath.textContent = settings.todoFile
  footPath.title = settings.todoFile
  foot.append(footLabel, footPath)
  modal.appendChild(foot)

  const save = (): Promise<boolean> => window.crafterm.todoWrite(settings.todoFile, serializeTodo(doc))

  type Entry = { section: Section; idx: number; text: string; inProgress?: boolean }
  interface RowAction {
    icon: string
    title: string
    cls?: string
    run: () => void | Promise<void>
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
    const input = document.createElement('input')
    input.className = 'improve-edit-input'
    input.value = entry.text
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

  const makeRow = (
    entry: Entry,
    opts: { editable?: boolean; nextUp?: boolean; actions: RowAction[] }
  ): HTMLElement => {
    const row = document.createElement('div')
    row.className = 'improve-item'
    if (opts.nextUp) row.classList.add('next-up')
    const { num, body } = splitOrder(entry.text)
    if (num) {
      const order = document.createElement('span')
      order.className = 'improve-order'
      order.title = `Priority #${num}`
      order.textContent = num
      row.appendChild(order)
    }
    const text = document.createElement('span')
    text.className = 'improve-item-text'
    if (opts.nextUp) {
      const tag = document.createElement('span')
      tag.className = 'improve-badge next'
      tag.title = 'Next up — AI will implement this one next'
      tag.textContent = '▶ next'
      text.appendChild(tag)
    }
    if (entry.inProgress) {
      const badge = document.createElement('span')
      badge.className = 'improve-badge ai'
      badge.title = 'In progress — being worked on by AI'
      badge.textContent = '🤖 in progress'
      text.appendChild(badge)
    }
    text.appendChild(document.createTextNode(body))
    text.title = 'Click to read full text'
    text.addEventListener('click', (e) => {
      e.stopPropagation()
      showDetail(entry.text)
    })

    const acts = document.createElement('div')
    acts.className = 'improve-item-actions'
    if (opts.editable) {
      const eb = document.createElement('button')
      eb.className = 'improve-item-btn'
      eb.type = 'button'
      eb.textContent = '✎'
      eb.title = 'Edit'
      eb.addEventListener('click', () => beginEdit(entry, row))
      acts.appendChild(eb)
    }
    opts.actions.forEach((a) => {
      const b = document.createElement('button')
      b.className = 'improve-item-btn' + (a.cls ? ' ' + a.cls : '')
      b.type = 'button'
      b.textContent = a.icon
      b.title = a.title
      b.addEventListener('click', () => void a.run())
      acts.appendChild(b)
    })
    row.append(text, acts)
    return row
  }

  // Which tab is shown in the single wide panel.
  let activeTab: 'todo' | 'ready' | 'done' = 'todo'

  // Small uppercase divider used inside the Todo list to separate the
  // "in progress" group from the "up next" (backlog) group.
  const addSubhead = (list: HTMLElement, label: string): void => {
    const sh = document.createElement('div')
    sh.className = 'improve-subhead'
    sh.textContent = label
    list.appendChild(sh)
  }

  const renderStats = (): void => {
    const p = sectionBy(doc, 'progress')?.items.length ?? 0
    const b = sectionBy(doc, 'backlog')?.items.length ?? 0
    const r = sectionBy(doc, 'ready')?.items.length ?? 0
    const d = sectionBy(doc, 'done')?.items.length ?? 0
    const total = p + b + r + d
    const pct = total ? Math.round((d / total) * 100) : 0
    stats.replaceChildren()
    const counts = document.createElement('div')
    counts.className = 'improve-stats-counts'
    const chip = (n: number, label: string, cls: string): void => {
      const c = document.createElement('span')
      c.className = 'improve-stat ' + cls
      c.innerHTML = `<b>${n}</b> ${label}`
      counts.appendChild(c)
    }
    chip(p, 'in progress', 'st-prog')
    chip(b, 'backlog', 'st-back')
    chip(r, 'ready to test', 'st-ready')
    chip(d, 'done', 'st-done')
    const pctEl = document.createElement('span')
    pctEl.className = 'improve-stats-pct'
    pctEl.textContent = `${pct}% done`
    counts.appendChild(pctEl)
    const bar = document.createElement('div')
    bar.className = 'improve-progress'
    const fillEl = document.createElement('div')
    fillEl.className = 'improve-progress-fill'
    fillEl.style.width = pct + '%'
    bar.appendChild(fillEl)
    stats.append(counts, bar)
  }

  // Render the Todo list (in-progress + backlog, with drag-to-reorder) into `list`.
  const fillTodo = (list: HTMLElement, progEntries: Entry[], backEntries: Entry[], backlog?: Section): void => {
    const splitGroups = progEntries.length > 0 && backEntries.length > 0
    const doneAction = (entry: Entry): RowAction => ({
      icon: '✓',
      title: 'Mark done',
      cls: 'mark-done',
      run: () => moveEntry(entry, 'Done', true)
    })
    if (splitGroups) addSubhead(list, '🤖 In progress')
    progEntries.forEach((entry) =>
      list.appendChild(makeRow(entry, { editable: true, actions: [doneAction(entry)] }))
    )
    if (splitGroups) addSubhead(list, 'Up next')
    // Drag to reorder backlog priority — file order is the AI's work order.
    let dragFrom: number | null = null
    backEntries.forEach((entry, i) => {
      const row = makeRow(entry, { editable: true, nextUp: i === 0, actions: [doneAction(entry)] })
      row.draggable = true
      row.classList.add('draggable')
      row.addEventListener('dragstart', (e) => {
        dragFrom = i
        row.classList.add('dragging')
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      })
      row.addEventListener('dragend', () => {
        dragFrom = null
        list.querySelectorAll('.improve-item').forEach((el) => el.classList.remove('dragging', 'drag-over'))
      })
      row.addEventListener('dragover', (e) => {
        e.preventDefault()
        row.classList.add('drag-over')
      })
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'))
      row.addEventListener('drop', async (e) => {
        e.preventDefault()
        row.classList.remove('drag-over')
        if (dragFrom === null || dragFrom === i || !backlog) return
        const [moved] = backlog.items.splice(dragFrom, 1)
        backlog.items.splice(i, 0, moved)
        await save()
        render()
      })
      list.appendChild(row)
    })
  }

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

    // --- tab bar: one wide panel at a time, easier to read long ideas ---
    const tabs = document.createElement('div')
    tabs.className = 'improve-tabs'
    const mkTab = (key: typeof activeTab, label: string, count: number): void => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'improve-tab' + (activeTab === key ? ' active' : '')
      const c = document.createElement('span')
      c.className = 'improve-tab-count'
      c.textContent = String(count)
      b.append(document.createTextNode(label + ' '), c)
      b.addEventListener('click', () => {
        activeTab = key
        render()
      })
      tabs.appendChild(b)
    }
    mkTab('todo', 'Todo', todoCount)
    mkTab('ready', 'Ready to test', readyItems.length)
    mkTab('done', 'Done', doneItems.length)
    cols.appendChild(tabs)

    // "Clear all" toolbar only on the Done tab when there's something to clear
    if (activeTab === 'done' && doneItems.length) {
      const toolbar = document.createElement('div')
      toolbar.className = 'improve-panel-toolbar'
      const clearBtn = document.createElement('button')
      clearBtn.className = 'improve-clear-done'
      clearBtn.type = 'button'
      clearBtn.textContent = 'Clear all'
      clearBtn.title = 'Remove all done items from todo-list.md'
      clearBtn.addEventListener('click', async () => {
        const ok = await promptConfirm({
          title: 'Clear done items',
          message: `Remove all ${doneItems.length} done item(s)? This rewrites todo-list.md.`,
          confirmText: 'Clear all'
        })
        if (!ok) return
        if (done) done.items = []
        await save()
        render()
      })
      toolbar.appendChild(clearBtn)
      cols.appendChild(toolbar)
    }

    const list = document.createElement('div')
    list.className = 'improve-list improve-panel'
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
        readyItems.forEach((entry) =>
          list.appendChild(
            makeRow(entry, {
              editable: true,
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
        doneItems.forEach((text) => {
          const row = document.createElement('div')
          row.className = 'improve-item done'
          const tick = document.createElement('span')
          tick.className = 'improve-tick'
          tick.textContent = '✓'
          const span = document.createElement('span')
          span.className = 'improve-item-text'
          span.textContent = text
          row.append(tick, span)
          list.appendChild(row)
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
