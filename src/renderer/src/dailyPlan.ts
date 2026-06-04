import type { DailyPlanTask, DailyPlanTag, DailyPlanStatus, DailyPlanPriority } from './types'
import { settings, state, panes, saveSoon, uid } from './state'
import { makeCloseButton, promptConfirm } from './dialog'
import { showRemindModal } from './reminders'
import { flattenProjects, findProjectById } from './catalog'
import { openClaudeWithPrompt } from './commands'
import { refreshPaneDailyTask } from './pane'

const STATUSES: { id: DailyPlanStatus; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'Todo' },
  { id: 'wip', label: 'In Progress' },
  { id: 'done', label: 'Done' }
]

const PRIORITIES: { id: DailyPlanPriority; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' }
]

const TAG_PALETTE = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#64748b'
]

function nextTagColor(): string {
  const used = new Set(settings.dailyPlan.tags.map((t) => t.color))
  return TAG_PALETTE.find((c) => !used.has(c)) ?? TAG_PALETTE[settings.dailyPlan.tags.length % TAG_PALETTE.length]
}

function todayKey(): string {
  const d = new Date()
  return ymd(d)
}

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map((n) => parseInt(n, 10))
  return new Date(y, (m || 1) - 1, d || 1)
}

function shiftDays(date: string, delta: number): string {
  const d = parseYmd(date)
  d.setDate(d.getDate() + delta)
  return ymd(d)
}

function formatHeader(date: string): string {
  const d = parseYmd(date)
  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' })
  const month = d.toLocaleDateString(undefined, { month: 'long' })
  const today = todayKey()
  const prefix = date === today ? 'Today · ' : date === shiftDays(today, -1) ? 'Yesterday · ' : date === shiftDays(today, 1) ? 'Tomorrow · ' : ''
  return `${prefix}${weekday}, ${month} ${d.getDate()}, ${d.getFullYear()}`
}

function tasksFor(date: string): DailyPlanTask[] {
  return settings.dailyPlan.tasks.filter((t) => t.date === date)
}

// Active board scope: a single day, or the last N days up to today.
type DailyRange = 'day' | '3d' | '7d'
let selectedRange: DailyRange = 'day'

// Active tag filter (tag ids). Empty = no filter. A task matches when it carries
// ANY of the selected tags (OR semantics).
const tagFilter = new Set<string>()

function matchesTagFilter(task: DailyPlanTask): boolean {
  if (!tagFilter.size) return true
  return task.tagIds.some((id) => tagFilter.has(id))
}

// Tasks shown on the board for the current scope. Day-based YMD keys compare
// lexicographically, so string range checks are correct.
function tasksForScope(): DailyPlanTask[] {
  const inScope =
    selectedRange === 'day'
      ? tasksFor(selectedDate)
      : (() => {
          const span = selectedRange === '3d' ? 3 : 7
          const today = todayKey()
          const start = shiftDays(today, -(span - 1))
          return settings.dailyPlan.tasks.filter((t) => t.date >= start && t.date <= today)
        })()
  return inScope.filter(matchesTagFilter)
}

function tagById(id: string): DailyPlanTag | undefined {
  return settings.dailyPlan.tags.find((t) => t.id === id)
}

// Assign the task a stable issue key (e.g. CRF-12) from its project's prefix.
// Returns the key, or null when the task has no project / the project has no
// prefix configured. Idempotent: an already-keyed task keeps its key.
function assignIssueKey(task: DailyPlanTask): string | null {
  if (task.issueKey) return task.issueKey
  const project = task.projectId ? findProjectById(state.tree, task.projectId) : null
  const prefix = project?.issueKeyPrefix?.trim()
  if (!prefix) return null
  const re = new RegExp(`^${prefix}-(\\d+)$`)
  let max = 0
  for (const t of settings.dailyPlan.tasks) {
    const m = t.issueKey?.match(re)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  task.issueKey = `${prefix}-${max + 1}`
  task.updatedAt = Date.now()
  saveSoon()
  return task.issueKey
}

// Open a Claude terminal in the task's project, seeded with title + description
// and titled by the issue key. Warns (and aborts) when no project / prefix is set.
async function openTaskInTerminal(task: DailyPlanTask, onChange: () => void): Promise<void> {
  const project = task.projectId ? findProjectById(state.tree, task.projectId) : null
  if (!project) {
    await promptConfirm({
      title: 'No project',
      message: 'Assign a project to this task first (Edit → Project).',
      confirmText: 'OK'
    })
    return
  }
  const key = assignIssueKey(task)
  if (!key) {
    await promptConfirm({
      title: 'No issue key prefix',
      message: `Set an issue key prefix for "${project.name}" in Settings → Projects first.`,
      confirmText: 'OK'
    })
    return
  }
  onChange()
  const desc = task.description?.trim()
  const prompt = `${key} ${task.title}${desc ? `\n\n${desc}` : ''}`
  // Auto-assign the new terminal to this task (full match — see todo50).
  await openClaudeWithPrompt(project.id, project.path, prompt, key, task.id)
}

// ---- Terminal ↔ daily-task assignment (todo50) -------------------------

function taskById(id: string): DailyPlanTask | undefined {
  return settings.dailyPlan.tasks.find((t) => t.id === id)
}

const STATUS_LABEL: Record<DailyPlanStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  wip: 'In Progress',
  done: 'Done'
}

// Short label for a task used on the pane header chip (issue key, else title).
export function dailyTaskLabel(taskId: string): string | null {
  const t = taskById(taskId)
  if (!t) return null
  return t.issueKey ?? (t.title.length > 24 ? t.title.slice(0, 23) + '…' : t.title)
}

// Modal to assign (or change / clear) the daily task a terminal pane works on.
// Picking a task assigns it and opens the task form so its status can be updated.
export function assignPaneToTask(paneId: string): void {
  const pane = panes.get(paneId)
  if (!pane) return

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay daily-plan-form-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal prompt-modal daily-assign-modal'
  overlay.appendChild(modal)

  const close = (): void => {
    document.removeEventListener('keydown', onKey, true)
    overlay.remove()
  }
  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKey, true)
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  modal.appendChild(makeCloseButton(close))

  const h = document.createElement('h2')
  h.textContent = 'Assign daily task'
  modal.appendChild(h)

  const assign = (taskId: string | null): void => {
    pane.dailyTaskId = taskId
    saveSoon()
    refreshPaneDailyTask(paneId)
    close()
    if (taskId) {
      const t = taskById(taskId)
      if (t) showTaskForm(t, () => activeDailyRerender?.())
    }
  }

  // Current assignment (with Open / Clear actions).
  const current = pane.dailyTaskId ? taskById(pane.dailyTaskId) : null
  if (current) {
    const cur = document.createElement('div')
    cur.className = 'daily-assign-current'
    const label = document.createElement('span')
    label.textContent = `Current: ${current.issueKey ? current.issueKey + ' · ' : ''}${current.title}`
    const clear = document.createElement('button')
    clear.className = 'daily-plan-secondary-btn'
    clear.textContent = 'Clear'
    clear.addEventListener('click', () => assign(null))
    cur.append(label, clear)
    modal.appendChild(cur)
  }

  const search = document.createElement('input')
  search.type = 'text'
  search.className = 'daily-assign-search'
  search.placeholder = 'Search tasks…'
  search.addEventListener('keydown', (e) => e.stopPropagation())
  modal.appendChild(search)

  const list = document.createElement('div')
  list.className = 'daily-assign-list'
  modal.appendChild(list)

  // Candidate tasks: not done, most recent first, capped.
  const candidates = settings.dailyPlan.tasks
    .filter((t) => t.status !== 'done')
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)

  const renderList = (): void => {
    list.innerHTML = ''
    const q = search.value.trim().toLowerCase()
    const items = candidates
      .filter((t) => !q || `${t.title} ${t.issueKey ?? ''}`.toLowerCase().includes(q))
      .slice(0, 50)
    if (!items.length) {
      const empty = document.createElement('div')
      empty.className = 'daily-assign-empty'
      empty.textContent = 'No matching tasks'
      list.appendChild(empty)
      return
    }
    for (const t of items) {
      const row = document.createElement('button')
      row.className = 'daily-assign-row'
      const main = document.createElement('span')
      main.className = 'daily-assign-row-title'
      main.textContent = `${t.issueKey ? t.issueKey + ' · ' : ''}${t.title}`
      const meta = document.createElement('span')
      meta.className = 'daily-assign-row-meta'
      meta.textContent = `${STATUS_LABEL[t.status]} · ${t.date}`
      row.append(main, meta)
      row.addEventListener('click', () => assign(t.id))
      list.appendChild(row)
    }
  }
  search.addEventListener('input', renderList)
  renderList()

  document.body.appendChild(overlay)
  search.focus()
}

// ---- Main entry --------------------------------------------------------

let selectedDate = todayKey()

export function showDailyPlanModal(initialDate?: string, focusTaskId?: string): void {
  selectedDate = initialDate ?? todayKey()

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal daily-plan-modal'
  overlay.appendChild(modal)

  const close = (): void => {
    document.removeEventListener('keydown', onKey, true)
    overlay.remove()
  }
  const onKey = (e: KeyboardEvent): void => {
    // Defer to a child form modal or an open tag-filter popover (they handle Esc).
    if (document.querySelector('.daily-plan-form-overlay') || document.querySelector('.daily-tagfilter-pop')) return
    e.stopPropagation()
    if (e.key === 'Escape') close()
  }
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  document.addEventListener('keydown', onKey, true)

  modal.appendChild(makeCloseButton(close))

  const header = document.createElement('div')
  header.className = 'daily-plan-header'
  modal.appendChild(header)

  const board = document.createElement('div')
  board.className = 'daily-plan-board'
  modal.appendChild(board)

  const render = (): void => {
    renderHeader(header, render)
    renderBoard(board, render)
  }
  render()

  document.body.appendChild(overlay)

  // Deep-link: open the edit form for a specific task (e.g. from a reminder card).
  if (focusTaskId) {
    const task = settings.dailyPlan.tasks.find((t) => t.id === focusTaskId)
    if (task) showTaskForm(task, render)
  }
}

// Last in-place re-render of the docked daily panel (right panel or Notebook
// sub-tab). Lets the global Cmd+N shortcut open the task form and refresh the
// board even though it has no direct handle to the panel's render closure.
let activeDailyRerender: (() => void) | null = null

// Compact Daily Plan view for the narrow Notebook sub-tab: a status tab strip
// (Backlog/Todo/In Progress/Done) + a search box + a single filtered card list,
// plus a full-screen button that opens the wide board modal. No per-day
// navigation — only the range dropdown (today / last N days).
let compactStatus: DailyPlanStatus = 'todo'
let compactSearch = ''

export function renderDailyCompact(host: HTMLElement): void {
  host.innerHTML = ''
  host.classList.add('daily-compact')
  const render = (): void => renderDailyCompact(host)
  activeDailyRerender = render

  const tasks = tasksForScope()

  // --- Toolbar: title · fullscreen · range · new task --------------------
  const toolbar = document.createElement('div')
  toolbar.className = 'daily-compact-toolbar'

  const title = document.createElement('div')
  title.className = 'daily-compact-title'
  title.textContent = 'Daily Plan'

  const full = document.createElement('button')
  full.className = 'daily-compact-full'
  full.title = 'Open full board'
  full.textContent = '⛶'
  full.addEventListener('click', () => showDailyPlanModal(selectedDate))

  const rangeSel = document.createElement('select')
  rangeSel.className = 'settings-select daily-compact-range'
  ;[
    ['day', 'Today'],
    ['3d', 'Last 3 days'],
    ['7d', 'Last 7 days']
  ].forEach(([val, label]) => {
    const o = document.createElement('option')
    o.value = val
    o.textContent = label
    if (val === selectedRange) o.selected = true
    rangeSel.appendChild(o)
  })
  rangeSel.addEventListener('change', () => {
    selectedRange = rangeSel.value as DailyRange
    render()
  })

  const newBtn = document.createElement('button')
  newBtn.className = 'daily-plan-primary-btn daily-compact-new'
  newBtn.textContent = '+ New'
  newBtn.addEventListener('click', () => showTaskForm(null, render, compactStatus))

  toolbar.append(title, full, rangeSel, newBtn)
  host.appendChild(toolbar)

  // --- Status tab strip (counts per status, current scope) ---------------
  const tabs = document.createElement('div')
  tabs.className = 'daily-compact-tabs'
  for (const status of STATUSES) {
    const count = tasks.filter((t) => t.status === status.id).length
    const b = document.createElement('button')
    b.className = 'daily-compact-tab' + (compactStatus === status.id ? ' active' : '')
    const label = document.createElement('span')
    label.textContent = status.label
    const badge = document.createElement('span')
    badge.className = 'daily-compact-tab-count'
    badge.textContent = String(count)
    b.append(label, badge)
    b.addEventListener('click', () => {
      compactStatus = status.id
      render()
    })
    tabs.appendChild(b)
  }
  host.appendChild(tabs)

  // --- Search ------------------------------------------------------------
  const search = document.createElement('input')
  search.type = 'text'
  search.className = 'nb-subtab-search'
  search.placeholder = 'Search tasks…'
  search.value = compactSearch
  search.addEventListener('keydown', (e) => e.stopPropagation())
  host.appendChild(search)

  // --- Card list (selected status, filtered by search) -------------------
  const listHost = document.createElement('div')
  listHost.className = 'daily-compact-list'
  host.appendChild(listHost)

  const fillList = (): void => {
    listHost.replaceChildren()
    const q = compactSearch.trim().toLowerCase()
    const items = tasks
      .filter((t) => t.status === compactStatus)
      .filter((t) => !q || `${t.title} ${t.description ?? ''} ${t.issueKey ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => a.order - b.order)
    if (!items.length) {
      const empty = document.createElement('div')
      empty.className = 'daily-compact-empty'
      empty.textContent = q ? 'No matching tasks' : 'No tasks here'
      listHost.appendChild(empty)
      return
    }
    for (const task of items) listHost.appendChild(renderCard(task, render))
  }
  search.addEventListener('input', () => {
    compactSearch = search.value
    fillList()
  })
  fillList()
}

// Cmd+N entry point while the Daily Plan view is shown: open the new-task form
// and refresh the docked view on save.
export function openNewDailyTask(): void {
  showTaskForm(null, () => activeDailyRerender?.(), compactStatus)
}

// ---- Header (date controls + new task) ---------------------------------

function renderHeader(host: HTMLElement, rerender: () => void): void {
  host.innerHTML = ''

  const title = document.createElement('div')
  title.className = 'daily-plan-title'
  title.textContent = 'Daily Plan'
  host.appendChild(title)

  const subtitle = document.createElement('div')
  subtitle.className = 'daily-plan-subtitle'
  subtitle.textContent = formatHeader(selectedDate)
  host.appendChild(subtitle)

  const nav = document.createElement('div')
  nav.className = 'daily-plan-nav'

  const prev = document.createElement('button')
  prev.className = 'daily-plan-nav-btn'
  prev.title = 'Previous day'
  prev.textContent = '‹'
  prev.addEventListener('click', () => {
    selectedDate = shiftDays(selectedDate, -1)
    rerender()
  })

  const dateInput = document.createElement('input')
  dateInput.type = 'date'
  dateInput.className = 'daily-plan-date-input'
  dateInput.value = selectedDate
  dateInput.addEventListener('change', () => {
    if (dateInput.value) {
      selectedDate = dateInput.value
      rerender()
    }
  })

  const next = document.createElement('button')
  next.className = 'daily-plan-nav-btn'
  next.title = 'Next day'
  next.textContent = '›'
  next.addEventListener('click', () => {
    selectedDate = shiftDays(selectedDate, 1)
    rerender()
  })

  const today = document.createElement('button')
  today.className = 'daily-plan-today-btn'
  today.textContent = 'Today'
  today.addEventListener('click', () => {
    selectedDate = todayKey()
    rerender()
  })

  nav.append(prev, dateInput, next, today)
  host.appendChild(nav)

  const actions = document.createElement('div')
  actions.className = 'daily-plan-actions'

  const rangeSel = document.createElement('select')
  rangeSel.className = 'settings-select daily-plan-range'
  ;[
    ['day', 'Today'],
    ['3d', 'Last 3 days'],
    ['7d', 'Last 7 days']
  ].forEach(([val, label]) => {
    const o = document.createElement('option')
    o.value = val
    o.textContent = label
    if (val === selectedRange) o.selected = true
    rangeSel.appendChild(o)
  })
  rangeSel.addEventListener('change', () => {
    selectedRange = rangeSel.value as DailyRange
    rerender()
  })
  actions.appendChild(rangeSel)

  const newBtn = document.createElement('button')
  newBtn.className = 'daily-plan-primary-btn'
  newBtn.textContent = '+ New task'
  newBtn.addEventListener('click', () => {
    showTaskForm(null, rerender)
  })

  const manageBtn = document.createElement('button')
  manageBtn.className = 'daily-plan-secondary-btn'
  manageBtn.textContent = 'Manage tags'
  manageBtn.addEventListener('click', () => {
    showManageTagsModal(rerender)
  })

  // Tag filter (multi-select, OR semantics). Only meaningful when tags exist.
  if (settings.dailyPlan.tags.length) {
    const filterBtn = document.createElement('button')
    filterBtn.className = 'daily-plan-secondary-btn daily-tagfilter-btn' + (tagFilter.size ? ' active' : '')
    filterBtn.textContent = tagFilter.size ? `Filter tags (${tagFilter.size})` : 'Filter tags'
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      openTagFilterPopover(filterBtn, rerender)
    })
    actions.append(filterBtn, newBtn, manageBtn)
  } else {
    actions.append(newBtn, manageBtn)
  }
  host.appendChild(actions)
}

// Multi-select tag-filter popover anchored under the "Filter tags" button.
// Toggling a tag updates `tagFilter` and re-renders the board live; the popover
// stays open (it lives on document.body, untouched by the header re-render).
function openTagFilterPopover(anchor: HTMLElement, rerender: () => void): void {
  document.querySelector('.daily-tagfilter-pop')?.remove()
  const pop = document.createElement('div')
  pop.className = 'daily-tagfilter-pop'
  const r = anchor.getBoundingClientRect()
  pop.style.left = Math.min(r.left, window.innerWidth - 240) + 'px'
  pop.style.top = r.bottom + 4 + 'px'

  const closePop = (): void => {
    pop.remove()
    document.removeEventListener('mousedown', onDoc, true)
    document.removeEventListener('keydown', onEsc, true)
  }
  const onDoc = (e: MouseEvent): void => {
    if (!pop.contains(e.target as Node) && e.target !== anchor) closePop()
  }
  const onEsc = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      closePop()
    }
  }

  const head = document.createElement('div')
  head.className = 'daily-tagfilter-head'
  const title = document.createElement('span')
  title.textContent = 'Filter by tags'
  head.appendChild(title)
  const clear = document.createElement('button')
  clear.className = 'daily-tagfilter-clear'
  clear.textContent = 'Clear'
  clear.addEventListener('click', () => {
    tagFilter.clear()
    rerender()
    closePop()
  })
  head.appendChild(clear)
  pop.appendChild(head)

  for (const tag of settings.dailyPlan.tags) {
    const row = document.createElement('button')
    row.className = 'daily-tagfilter-row' + (tagFilter.has(tag.id) ? ' active' : '')
    const swatch = document.createElement('span')
    swatch.className = 'daily-tagfilter-swatch'
    swatch.style.backgroundColor = tag.color
    const name = document.createElement('span')
    name.className = 'daily-tagfilter-name'
    name.textContent = tag.name
    const check = document.createElement('span')
    check.className = 'daily-tagfilter-check'
    check.textContent = '✓'
    row.append(swatch, name, check)
    row.addEventListener('click', () => {
      if (tagFilter.has(tag.id)) tagFilter.delete(tag.id)
      else tagFilter.add(tag.id)
      row.classList.toggle('active', tagFilter.has(tag.id))
      rerender()
    })
    pop.appendChild(row)
  }

  document.body.appendChild(pop)
  setTimeout(() => {
    document.addEventListener('mousedown', onDoc, true)
    document.addEventListener('keydown', onEsc, true)
  }, 0)
}

// ---- Board (columns) ---------------------------------------------------

// Per-column search query (persists across re-renders within a session).
const colSearch: Partial<Record<DailyPlanStatus, string>> = {}

// Hide cards in a column body that don't match its search query; keep the count
// chip in sync with the visible cards. Filtering by display avoids a full
// re-render so the search input keeps focus while typing.
function applyColFilter(body: HTMLElement, countEl: HTMLElement, status: DailyPlanStatus): void {
  const q = (colSearch[status] ?? '').trim().toLowerCase()
  let visible = 0
  body.querySelectorAll<HTMLElement>('.daily-plan-card').forEach((card) => {
    const match = !q || (card.dataset.search ?? '').includes(q)
    card.style.display = match ? '' : 'none'
    if (match) visible++
  })
  countEl.textContent = String(visible)
}

function renderBoard(host: HTMLElement, rerender: () => void): void {
  host.innerHTML = ''
  const tasks = tasksForScope()
  const multiDay = selectedRange !== 'day'

  for (const status of STATUSES) {
    const col = document.createElement('div')
    col.className = 'daily-plan-column'
    col.dataset.status = status.id

    const head = document.createElement('div')
    head.className = 'daily-plan-column-head'
    const colTitle = document.createElement('span')
    colTitle.className = 'daily-plan-column-title'
    colTitle.textContent = status.label
    const colCount = document.createElement('span')
    colCount.className = 'daily-plan-column-count'
    const colTasks = tasks
      .filter((t) => t.status === status.id)
      .sort((a, b) => (multiDay && a.date !== b.date ? a.date.localeCompare(b.date) : a.order - b.order))
    colCount.textContent = String(colTasks.length)
    head.append(colTitle, colCount)
    col.appendChild(head)

    const search = document.createElement('input')
    search.type = 'text'
    search.className = 'daily-plan-col-search'
    search.placeholder = 'Search…'
    search.value = colSearch[status.id] ?? ''
    search.addEventListener('keydown', (e) => e.stopPropagation())
    search.addEventListener('input', () => {
      colSearch[status.id] = search.value
      applyColFilter(body, colCount, status.id)
    })
    col.appendChild(search)

    const body = document.createElement('div')
    body.className = 'daily-plan-column-body'
    col.appendChild(body)

    for (const task of colTasks) {
      body.appendChild(renderCard(task, rerender))
    }

    if (colTasks.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'daily-plan-empty-col'
      empty.textContent = 'Drop tasks here'
      body.appendChild(empty)
    }

    wireDropTarget(body, status.id, rerender)
    applyColFilter(body, colCount, status.id) // re-apply a persisted search query
    host.appendChild(col)
  }
}

// ---- Card --------------------------------------------------------------

function renderCard(task: DailyPlanTask, rerender: () => void): HTMLElement {
  const card = document.createElement('div')
  card.className = `daily-plan-card priority-${task.priority}`
  card.draggable = true
  card.dataset.taskId = task.id
  // Searchable text for the per-column filter (title + description + issue key).
  card.dataset.search = `${task.title} ${task.description ?? ''} ${task.issueKey ?? ''}`.toLowerCase()

  card.addEventListener('dragstart', (e) => {
    card.classList.add('dragging')
    e.dataTransfer?.setData('text/plain', task.id)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  })
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging')
  })

  const top = document.createElement('div')
  top.className = 'daily-plan-card-top'

  const dot = document.createElement('span')
  dot.className = `daily-plan-priority-dot priority-${task.priority}`
  dot.title = `${task.priority[0].toUpperCase() + task.priority.slice(1)} priority`
  top.appendChild(dot)

  if (task.issueKey) {
    const key = document.createElement('span')
    key.className = 'daily-plan-card-key'
    key.textContent = task.issueKey
    top.appendChild(key)
  }

  const title = document.createElement('div')
  title.className = 'daily-plan-card-title'
  title.textContent = task.title
  top.appendChild(title)

  const cardActions = document.createElement('div')
  cardActions.className = 'daily-plan-card-actions'

  const termBtn = document.createElement('button')
  termBtn.className = 'daily-plan-card-icon'
  termBtn.title = 'Open in Claude terminal'
  termBtn.textContent = '▶'
  termBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    void openTaskInTerminal(task, rerender)
  })

  const remindBtn = document.createElement('button')
  remindBtn.className = 'daily-plan-card-icon'
  remindBtn.title = 'Remind me'
  remindBtn.textContent = '⏰'
  remindBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    showRemindModal(task.title, task.title, { kind: 'dailyTask', taskId: task.id })
  })

  const editBtn = document.createElement('button')
  editBtn.className = 'daily-plan-card-icon'
  editBtn.title = 'Edit'
  editBtn.textContent = '✎'
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    showTaskForm(task, rerender)
  })

  const delBtn = document.createElement('button')
  delBtn.className = 'daily-plan-card-icon'
  delBtn.title = 'Delete'
  delBtn.textContent = '×'
  delBtn.addEventListener('click', async (e) => {
    e.stopPropagation()
    const ok = await promptConfirm({
      title: 'Delete task',
      message: `Delete "${task.title}"?`,
      confirmText: 'Delete'
    })
    if (!ok) return
    const idx = settings.dailyPlan.tasks.findIndex((t) => t.id === task.id)
    if (idx >= 0) settings.dailyPlan.tasks.splice(idx, 1)
    saveSoon()
    rerender()
  })

  cardActions.append(termBtn, remindBtn, editBtn, delBtn)
  top.appendChild(cardActions)

  card.appendChild(top)

  // In a multi-day range view, surface which day each card belongs to.
  if (selectedRange !== 'day') {
    const dateChip = document.createElement('div')
    dateChip.className = 'daily-plan-card-date'
    const d = parseYmd(task.date)
    const today = todayKey()
    dateChip.textContent =
      task.date === today
        ? 'Today'
        : task.date === shiftDays(today, -1)
          ? 'Yesterday'
          : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    card.appendChild(dateChip)
  }

  if (task.description && task.description.trim()) {
    const desc = document.createElement('div')
    desc.className = 'daily-plan-card-desc'
    desc.textContent = task.description.trim()
    card.appendChild(desc)
  }

  if (task.tagIds.length) {
    const tagRow = document.createElement('div')
    tagRow.className = 'daily-plan-card-tags'
    for (const tagId of task.tagIds) {
      const tag = tagById(tagId)
      if (!tag) continue
      const chip = document.createElement('span')
      chip.className = 'daily-plan-tag-chip'
      chip.style.backgroundColor = tag.color
      chip.textContent = tag.name
      tagRow.appendChild(chip)
    }
    card.appendChild(tagRow)
  }

  card.addEventListener('click', () => showTaskForm(task, rerender))

  return card
}

// ---- Drag-drop ---------------------------------------------------------

function wireDropTarget(body: HTMLElement, status: DailyPlanStatus, rerender: () => void): void {
  body.addEventListener('dragover', (e) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    body.classList.add('drop-target')
  })
  body.addEventListener('dragleave', (e) => {
    if (e.target === body) body.classList.remove('drop-target')
  })
  body.addEventListener('drop', (e) => {
    e.preventDefault()
    body.classList.remove('drop-target')
    const id = e.dataTransfer?.getData('text/plain') ?? ''
    if (!id) return
    const task = settings.dailyPlan.tasks.find((t) => t.id === id)
    if (!task) return

    const before = findInsertBefore(body, e.clientY)
    task.status = status
    // In a single-day view a drop re-homes the task to that day; in a multi-day
    // range view keep the task's own date and only change its status.
    if (selectedRange === 'day') task.date = selectedDate
    task.updatedAt = Date.now()
    reorderWithin(task, status, before)
    saveSoon()
    rerender()
  })
}

function findInsertBefore(body: HTMLElement, y: number): string | null {
  const cards = Array.from(body.querySelectorAll<HTMLElement>('.daily-plan-card:not(.dragging)'))
  for (const c of cards) {
    const r = c.getBoundingClientRect()
    if (y < r.top + r.height / 2) return c.dataset.taskId ?? null
  }
  return null
}

function reorderWithin(task: DailyPlanTask, status: DailyPlanStatus, beforeId: string | null): void {
  const peers = settings.dailyPlan.tasks
    .filter((t) => t.date === task.date && t.status === status && t.id !== task.id)
    .sort((a, b) => a.order - b.order)
  const insertIdx = beforeId == null ? peers.length : peers.findIndex((t) => t.id === beforeId)
  const idx = insertIdx < 0 ? peers.length : insertIdx
  peers.splice(idx, 0, task)
  peers.forEach((t, i) => (t.order = i))
}

// ---- Task form (create / edit) ----------------------------------------

function showTaskForm(
  existing: DailyPlanTask | null,
  onSaved: () => void,
  defaultStatus: DailyPlanStatus = 'todo'
): void {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay daily-plan-form-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal prompt-modal daily-plan-form'
  overlay.appendChild(modal)

  const close = (): void => {
    document.removeEventListener('keydown', onKey, true)
    overlay.remove()
  }
  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKey, true)
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  modal.appendChild(makeCloseButton(close))

  const h = document.createElement('h2')
  h.textContent = existing ? 'Edit task' : 'New task'
  modal.appendChild(h)

  // Title
  const titleField = document.createElement('div')
  titleField.className = 'field'
  titleField.innerHTML = '<label>Title</label>'
  const titleInput = document.createElement('input')
  titleInput.type = 'text'
  titleInput.value = existing?.title ?? ''
  titleInput.placeholder = 'What needs doing?'
  titleField.appendChild(titleInput)
  modal.appendChild(titleField)

  // Description (optional)
  const descField = document.createElement('div')
  descField.className = 'field'
  descField.innerHTML = '<label>Description <span class="field-hint">(optional)</span></label>'
  const descInput = document.createElement('textarea')
  descInput.rows = 3
  descInput.value = existing?.description ?? ''
  descInput.placeholder = 'Notes, links, context…'
  descInput.className = 'daily-plan-desc-input'
  descField.appendChild(descInput)
  modal.appendChild(descField)

  // Status
  const statusField = document.createElement('div')
  statusField.className = 'field'
  statusField.innerHTML = '<label>Status</label>'
  const statusSel = document.createElement('select')
  for (const s of STATUSES) {
    const o = document.createElement('option')
    o.value = s.id
    o.textContent = s.label
    statusSel.appendChild(o)
  }
  statusSel.value = existing?.status ?? defaultStatus
  statusField.appendChild(statusSel)
  modal.appendChild(statusField)

  // Priority
  const prioField = document.createElement('div')
  prioField.className = 'field'
  prioField.innerHTML = '<label>Priority</label>'
  const prioSel = document.createElement('select')
  for (const p of PRIORITIES) {
    const o = document.createElement('option')
    o.value = p.id
    o.textContent = p.label
    prioSel.appendChild(o)
  }
  prioSel.value = existing?.priority ?? 'medium'
  prioField.appendChild(prioSel)
  modal.appendChild(prioField)

  // Date
  const dateField = document.createElement('div')
  dateField.className = 'field'
  dateField.innerHTML = '<label>Date</label>'
  const dateInput = document.createElement('input')
  dateInput.type = 'date'
  dateInput.value = existing?.date ?? selectedDate
  dateField.appendChild(dateInput)
  modal.appendChild(dateField)

  // Project (optional) — provides the terminal cwd and the issue-key prefix.
  const projField = document.createElement('div')
  projField.className = 'field'
  projField.innerHTML = '<label>Project <span class="field-hint">(optional)</span></label>'
  const projSel = document.createElement('select')
  const noneOpt = document.createElement('option')
  noneOpt.value = ''
  noneOpt.textContent = '— None —'
  projSel.appendChild(noneOpt)
  const projects = flattenProjects(state.tree)
  for (const p of projects) {
    const o = document.createElement('option')
    o.value = p.id
    o.textContent = p.issueKeyPrefix ? `${p.name} (${p.issueKeyPrefix})` : p.name
    projSel.appendChild(o)
  }
  projSel.value = existing?.projectId ?? ''
  projField.appendChild(projSel)
  const projHint = document.createElement('div')
  projHint.className = 'daily-plan-proj-hint'
  const updateProjHint = (): void => {
    const p = projSel.value ? projects.find((x) => x.id === projSel.value) : null
    projHint.textContent = p ? p.path : ''
  }
  projSel.addEventListener('change', updateProjHint)
  updateProjHint()
  projField.appendChild(projHint)
  modal.appendChild(projField)

  // Tags
  const tagField = document.createElement('div')
  tagField.className = 'field'
  tagField.innerHTML = '<label>Tags</label>'
  const tagPicker = document.createElement('div')
  tagPicker.className = 'daily-plan-tag-picker'
  tagField.appendChild(tagPicker)
  modal.appendChild(tagField)

  const selectedTagIds: string[] = [...(existing?.tagIds ?? [])]
  buildTagPicker(tagPicker, selectedTagIds)

  // Persist the form into a task (updating `existing` or creating a new one) and
  // return it; null when the title is empty. Shared by Save and Remind.
  const commit = (): DailyPlanTask | null => {
    const title = titleInput.value.trim()
    if (!title) {
      titleInput.focus()
      return null
    }
    const now = Date.now()
    const description = descInput.value.trim()
    if (existing) {
      existing.title = title
      existing.description = description || undefined
      existing.status = statusSel.value as DailyPlanStatus
      existing.priority = prioSel.value as DailyPlanPriority
      existing.date = dateInput.value || selectedDate
      existing.tagIds = selectedTagIds.slice()
      existing.projectId = projSel.value || undefined
      existing.updatedAt = now
      saveSoon()
      return existing
    }
    const newTask: DailyPlanTask = {
      id: uid('task'),
      title,
      description: description || undefined,
      date: dateInput.value || selectedDate,
      status: statusSel.value as DailyPlanStatus,
      priority: prioSel.value as DailyPlanPriority,
      tagIds: selectedTagIds.slice(),
      projectId: projSel.value || undefined,
      order: nextOrder(dateInput.value || selectedDate, statusSel.value as DailyPlanStatus),
      createdAt: now,
      updatedAt: now
    }
    settings.dailyPlan.tasks.push(newTask)
    saveSoon()
    return newTask
  }

  // Actions
  const actions = document.createElement('div')
  actions.className = 'modal-actions'
  const cancel = document.createElement('button')
  cancel.textContent = 'Cancel'
  cancel.addEventListener('click', close)
  const remind = document.createElement('button')
  remind.textContent = '⏰ Remind…'
  remind.title = 'Save and set a reminder for this task'
  remind.addEventListener('click', () => {
    const task = commit()
    if (!task) return
    close()
    onSaved()
    showRemindModal(task.title, task.title, { kind: 'dailyTask', taskId: task.id })
  })
  const openTerm = document.createElement('button')
  openTerm.textContent = '▶ Open in terminal'
  openTerm.title = 'Save and open a Claude terminal seeded with this task'
  openTerm.addEventListener('click', () => {
    const task = commit()
    if (!task) return
    close()
    onSaved()
    void openTaskInTerminal(task, onSaved)
  })
  const save = document.createElement('button')
  save.className = 'primary'
  save.textContent = 'Save'
  save.addEventListener('click', () => {
    if (!commit()) return
    close()
    onSaved()
  })
  actions.append(cancel, remind, openTerm, save)
  modal.appendChild(actions)

  document.body.appendChild(overlay)
  titleInput.focus()
  titleInput.select()
}

function nextOrder(date: string, status: DailyPlanStatus): number {
  const peers = settings.dailyPlan.tasks.filter((t) => t.date === date && t.status === status)
  return peers.length ? Math.max(...peers.map((t) => t.order)) + 1 : 0
}

// ---- Tag multi-select picker (used inside the task form) --------------

function buildTagPicker(host: HTMLElement, selectedIds: string[]): void {
  host.innerHTML = ''

  const chipBar = document.createElement('div')
  chipBar.className = 'daily-plan-tag-chipbar'
  host.appendChild(chipBar)

  const renderChips = (): void => {
    chipBar.innerHTML = ''
    for (const tagId of selectedIds) {
      const tag = tagById(tagId)
      if (!tag) continue
      const chip = document.createElement('span')
      chip.className = 'daily-plan-tag-chip removable'
      chip.style.backgroundColor = tag.color
      chip.textContent = tag.name
      const x = document.createElement('button')
      x.className = 'daily-plan-tag-chip-x'
      x.textContent = '×'
      x.addEventListener('click', () => {
        const i = selectedIds.indexOf(tagId)
        if (i >= 0) selectedIds.splice(i, 1)
        renderChips()
      })
      chip.appendChild(x)
      chipBar.appendChild(chip)
    }
  }

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'daily-plan-tag-input'
  input.placeholder = 'Search or create tag…'
  host.appendChild(input)

  const dropdown = document.createElement('div')
  dropdown.className = 'daily-plan-tag-dropdown'
  dropdown.hidden = true
  host.appendChild(dropdown)

  const renderDropdown = (): void => {
    dropdown.innerHTML = ''
    const q = input.value.trim().toLowerCase()
    const matches = settings.dailyPlan.tags
      .filter((t) => !selectedIds.includes(t.id) && (!q || t.name.toLowerCase().includes(q)))
      .slice(0, 20)
    for (const tag of matches) {
      const row = document.createElement('button')
      row.className = 'daily-plan-tag-option'
      const swatch = document.createElement('span')
      swatch.className = 'daily-plan-tag-swatch'
      swatch.style.backgroundColor = tag.color
      const name = document.createElement('span')
      name.textContent = tag.name
      row.append(swatch, name)
      row.addEventListener('mousedown', (e) => {
        e.preventDefault()
        selectedIds.push(tag.id)
        input.value = ''
        renderChips()
        renderDropdown()
        input.focus()
      })
      dropdown.appendChild(row)
    }
    const exact = settings.dailyPlan.tags.some((t) => t.name.toLowerCase() === q)
    if (q && !exact) {
      const create = document.createElement('button')
      create.className = 'daily-plan-tag-option create'
      create.textContent = `+ Create "${input.value.trim()}"`
      create.addEventListener('mousedown', (e) => {
        e.preventDefault()
        const tag: DailyPlanTag = {
          id: uid('tag'),
          name: input.value.trim(),
          color: nextTagColor()
        }
        settings.dailyPlan.tags.push(tag)
        selectedIds.push(tag.id)
        input.value = ''
        saveSoon()
        renderChips()
        renderDropdown()
        input.focus()
      })
      dropdown.appendChild(create)
    }
    dropdown.hidden = dropdown.childElementCount === 0
  }

  input.addEventListener('focus', () => {
    renderDropdown()
  })
  input.addEventListener('input', renderDropdown)
  input.addEventListener('blur', () => {
    setTimeout(() => (dropdown.hidden = true), 120)
  })
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      const first = dropdown.querySelector<HTMLButtonElement>('.daily-plan-tag-option')
      first?.dispatchEvent(new MouseEvent('mousedown'))
    }
  })

  renderChips()
}

// ---- Manage tags modal -------------------------------------------------

function showManageTagsModal(rerender: () => void): void {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay daily-plan-form-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal prompt-modal daily-plan-tags-modal'
  overlay.appendChild(modal)

  const close = (): void => {
    document.removeEventListener('keydown', onKey, true)
    overlay.remove()
    rerender()
  }
  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKey, true)
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  modal.appendChild(makeCloseButton(close))

  const h = document.createElement('h2')
  h.textContent = 'Manage tags'
  modal.appendChild(h)

  const list = document.createElement('div')
  list.className = 'daily-plan-tags-list'
  modal.appendChild(list)

  const renderList = (): void => {
    list.innerHTML = ''
    if (!settings.dailyPlan.tags.length) {
      const empty = document.createElement('div')
      empty.className = 'daily-plan-tags-empty'
      empty.textContent = 'No tags yet. Create one from the task form.'
      list.appendChild(empty)
      return
    }
    for (const tag of settings.dailyPlan.tags) {
      const row = document.createElement('div')
      row.className = 'daily-plan-tag-row'

      const color = document.createElement('input')
      color.type = 'color'
      color.value = tag.color
      color.className = 'daily-plan-tag-color'
      color.addEventListener('change', () => {
        tag.color = color.value
        saveSoon()
      })

      const name = document.createElement('input')
      name.type = 'text'
      name.value = tag.name
      name.className = 'daily-plan-tag-name'
      name.addEventListener('change', () => {
        const v = name.value.trim()
        if (v) {
          tag.name = v
          saveSoon()
        } else {
          name.value = tag.name
        }
      })

      const del = document.createElement('button')
      del.className = 'daily-plan-tag-delete'
      del.textContent = 'Delete'
      del.addEventListener('click', async () => {
        const ok = await promptConfirm({
          title: 'Delete tag',
          message: `Delete "${tag.name}"? It will be removed from every task.`,
          confirmText: 'Delete'
        })
        if (!ok) return
        const i = settings.dailyPlan.tags.findIndex((t) => t.id === tag.id)
        if (i >= 0) settings.dailyPlan.tags.splice(i, 1)
        for (const t of settings.dailyPlan.tasks) {
          t.tagIds = t.tagIds.filter((id) => id !== tag.id)
        }
        tagFilter.delete(tag.id) // drop from the active filter so the board isn't stranded empty
        saveSoon()
        renderList()
      })

      row.append(color, name, del)
      list.appendChild(row)
    }
  }
  renderList()

  document.body.appendChild(overlay)
}
