import './daily-plan.css'
import { UITexts } from '@texts'
import type {
  DailyPlanTask,
  DailyPlanTag,
  DailyPlanStatus,
  DailyPlanPriority
} from '@ui/types/types'
import type { DailyRange } from './daily-plan.types'
import { state, panes, uid } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'
import { dailyTaskRepo, dailyTagRepo } from '@repositories'
import { makeCloseButton, promptConfirm } from '@ui/components/dialog/dialog'
import { showRemindModal } from '../reminders/reminders'
import { findProjectById } from '@ui/catalog/catalog'
import { openClaudeWithPrompt } from '@ui/commands/commands'
import { ensureWorktreeForBranch, worktreeNodeForBranch, removeWorktree } from '@services/worktrees'
import { refreshPaneDailyTask } from '@ui/pane/pane'
import { createDateField, createOverlay } from '@ui/components'
import { boardColumnOf, parseYmd, shiftDays } from './task-helpers'
import {
  STATUSES,
  FORM_STATUSES,
  PRIORITIES,
  STATUS_LABEL,
  CHANGELOG_RANGES,
  nextTagColor,
  todayKey,
  shortDue,
  dueInfo,
  formatHeader,
  tasksFor,
  tagById,
  assignIssueKey,
  sanitizeSlug,
  worktreeBranchForTask,
  projectTree,
  taskById,
  nextOrder,
  findInsertBefore,
  reorderWithin,
  buildChangelogMarkdown
} from './daily-plan.state'

let selectedRange: DailyRange = 'day'
// Board project filter (todo4): null = all projects, else only this project's tasks.
let projectFilter: string | null = null

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
          return dailyTaskRepo.getAll().filter((t) => t.date >= start && t.date <= today)
        })()
  return inScope
    .filter(matchesTagFilter)
    .filter((t) => !projectFilter || t.projectId === projectFilter)
}

// Open a Claude terminal in the task's project, seeded with title + description
// and titled by the issue key. Warns (and aborts) when no project / prefix is set.
async function openTaskInTerminal(
  task: DailyPlanTask,
  onChange: () => void,
  useWorktree = false
): Promise<void> {
  const project = task.projectId ? findProjectById(state.tree, task.projectId) : null
  if (!project) {
    await promptConfirm({
      title: UITexts.DailyPlan.noProject.title,
      message: UITexts.DailyPlan.noProject.message,
      confirmText: UITexts.DailyPlan.ok
    })
    return
  }
  const key = assignIssueKey(task)
  if (!key) {
    await promptConfirm({
      title: UITexts.DailyPlan.noIssueKey.title,
      message: UITexts.DailyPlan.noIssueKey.message(project.name),
      confirmText: UITexts.DailyPlan.ok
    })
    return
  }
  // Starting work on a task: move it to In Progress (unless already done).
  if (task.status !== 'wip' && task.status !== 'done') {
    task.status = 'wip'
    task.updatedAt = Date.now()
    dailyTaskRepo.upsert(task)
  }
  onChange()
  const desc = task.description?.trim()
  // Prefix "ultrathink " by default so the Claude session reasons deeply (todo12).
  const prompt = `ultrathink ${key} ${task.title}${desc ? `\n\n${desc}` : ''}`
  let parentId: string | null = project.id
  let cwd = project.path
  if (useWorktree) {
    // Create (or reuse) a worktree whose branch == the issue key (optionally with
    // the task's slug suffix), and run there (todo6). The terminal nests under that
    // worktree node.
    const branch = worktreeBranchForTask(task, key)
    const wt = await ensureWorktreeForBranch(project, branch)
    if (!wt) {
      await promptConfirm({
        title: UITexts.DailyPlan.worktreeFailed.title,
        message: UITexts.DailyPlan.worktreeFailed.message(branch),
        confirmText: UITexts.DailyPlan.ok
      })
      return
    }
    cwd = wt.path
    parentId = wt.nodeId ?? project.id
  }
  // Title the terminal by the work (renameable); the issue key is shown as a
  // "(KEY)" suffix in the sidebar via the dailyTaskId link, not baked into the
  // editable title (todo14). Auto-assign to this task (full match — see todo50).
  await openClaudeWithPrompt(parentId, cwd, prompt, task.title, task.id)
}

// ---- Terminal ↔ daily-task assignment (todo50) -------------------------

// Short label for a task used on the pane header chip (issue key, else title).
export function dailyTaskLabel(taskId: string): string | null {
  const t = taskById(taskId)
  if (!t) return null
  return t.issueKey ?? (t.title.length > 24 ? t.title.slice(0, 23) + '…' : t.title)
}

// Issue key only — for the pane header chip, which is shown solely when the
// terminal was opened from a ticket (i.e. the task has an assigned key).
export function dailyTaskIssueKey(taskId: string): string | null {
  return taskById(taskId)?.issueKey ?? null
}

// Current status of a task — drives the pane menu's "Mark as done" visibility.
export function dailyTaskStatus(taskId: string): DailyPlanStatus | null {
  return taskById(taskId)?.status ?? null
}

// Open the edit/detail form for the task this pane is assigned to.
export function viewPaneTask(paneId: string): void {
  const taskId = panes.get(paneId)?.dailyTaskId
  if (!taskId) return
  const t = taskById(taskId)
  if (t) showTaskForm(t, () => activeDailyRerender?.())
}

// Mark this pane's assigned task as done without closing the terminal.
export function markPaneTaskDone(paneId: string): void {
  const taskId = panes.get(paneId)?.dailyTaskId
  if (!taskId) return
  const t = taskById(taskId)
  if (!t || t.status === 'done') return
  t.status = 'done'
  t.updatedAt = Date.now()
  dailyTaskRepo.upsert(t)
  refreshPaneDailyTask(paneId)
  activeDailyRerender?.()
  void offerDeleteTaskWorktree(t) // todo7
}

// Mark this pane's assigned task as code review without closing the terminal.
export function markPaneTaskReview(paneId: string): void {
  const taskId = panes.get(paneId)?.dailyTaskId
  if (!taskId) return
  const t = taskById(taskId)
  if (!t || t.status === 'review' || t.status === 'done') return
  t.status = 'review'
  t.updatedAt = Date.now()
  dailyTaskRepo.upsert(t)
  refreshPaneDailyTask(paneId)
  activeDailyRerender?.()
}

// Mark this pane's assigned task as test without closing the terminal.
export function markPaneTaskTest(paneId: string): void {
  const taskId = panes.get(paneId)?.dailyTaskId
  if (!taskId) return
  const t = taskById(taskId)
  if (!t || t.status === 'test' || t.status === 'done') return
  t.status = 'test'
  t.updatedAt = Date.now()
  dailyTaskRepo.upsert(t)
  refreshPaneDailyTask(paneId)
  activeDailyRerender?.()
}

// When a ticket is marked done from its terminal, offer to remove its worktree
// (the one whose branch == the issue key). removeWorktree shows its own confirm
// and reconcile archives the node afterwards (todo7).
async function offerDeleteTaskWorktree(task: DailyPlanTask): Promise<void> {
  const project = task.projectId ? findProjectById(state.tree, task.projectId) : null
  const key = task.issueKey
  if (!project || !key) return
  const wt = worktreeNodeForBranch(project, worktreeBranchForTask(task, key))
  if (wt) await removeWorktree(project, wt.worktreePath)
}

// Modal to assign (or change / clear) the daily task a terminal pane works on.
// Picking a task assigns it and opens the task form so its status can be updated.
export function assignPaneToTask(paneId: string): void {
  const pane = panes.get(paneId)
  if (!pane) return

  const { overlay, mount, close, onClose } = createOverlay()
  overlay.classList.add('daily-plan-form-overlay')

  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  }
  onClose(() => document.removeEventListener('keydown', onKey, true))
  document.addEventListener('keydown', onKey, true)

  const assign = (taskId: string | null): void => {
    pane.dailyTaskId = taskId
    persistence.save()
    refreshPaneDailyTask(paneId)
    close()
    if (taskId) {
      const t = taskById(taskId)
      if (t) showTaskForm(t, () => activeDailyRerender?.())
    }
  }

  // Current assignment (with Open / Clear actions).
  const current = pane.dailyTaskId ? taskById(pane.dailyTaskId) : null
  let currentRow: HTMLDivElement | null = null
  if (current) {
    const clear = (
      <button class="daily-plan-secondary-btn" onClick={() => assign(null)}>
        Clear
      </button>
    ) as HTMLButtonElement
    currentRow = (
      <div class="daily-assign-current">
        <span>{`Current: ${current.issueKey ? current.issueKey + ' · ' : ''}${current.title}`}</span>
        {clear}
      </div>
    ) as HTMLDivElement
  }

  const search = (
    <input
      type="text"
      class="daily-assign-search"
      placeholder={UITexts.DailyPlan.searchTasks}
      onKeydown={(e: KeyboardEvent) => e.stopPropagation()}
    />
  ) as HTMLInputElement

  const list = (<div class="daily-assign-list" />) as HTMLDivElement

  const modal = (
    <div class="modal modal-prompt daily-assign-modal">
      {makeCloseButton(close)}
      <h2>{UITexts.DailyPlan.assignTitle}</h2>
      {currentRow}
      {search}
      {list}
    </div>
  ) as HTMLDivElement
  overlay.appendChild(modal)

  // Candidate tasks: not done, most recent first, capped.
  const candidates = dailyTaskRepo.getAll()
    .filter((t) => t.status !== 'done')
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)

  const renderList = (): void => {
    list.innerHTML = ''
    const q = search.value.trim().toLowerCase()
    const items = candidates
      .filter((t) => !q || `${t.title} ${t.issueKey ?? ''}`.toLowerCase().includes(q))
      .slice(0, 50)
    if (!items.length) {
      list.appendChild((<div class="daily-assign-empty">No matching tasks</div>) as HTMLDivElement)
      return
    }
    for (const t of items) {
      const row = (
        <button class="daily-assign-row" onClick={() => assign(t.id)}>
          <span class="daily-assign-row-title">{`${t.issueKey ? t.issueKey + ' · ' : ''}${t.title}`}</span>
          <span class="daily-assign-row-meta">{`${STATUS_LABEL[t.status]} · ${t.date}`}</span>
        </button>
      ) as HTMLButtonElement
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

  const { overlay, mount, close, onClose } = createOverlay()

  const onKey = (e: KeyboardEvent): void => {
    // Defer to a child form modal or an open tag-filter popover (they handle Esc).
    if (document.querySelector('.daily-plan-form-overlay') || document.querySelector('.daily-tagfilter-pop')) return
    e.stopPropagation()
    if (e.key === 'Escape') {
      close()
    } else if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'n') {
      // Cmd+N opens the new-task form while the board modal is up (todo8 — the
      // global handler surrenders to open modals, so the modal owns this).
      e.preventDefault()
      showTaskForm(null, render)
    }
  }
  onClose(() => document.removeEventListener('keydown', onKey, true))
  document.addEventListener('keydown', onKey, true)

  const header = (<div class="daily-plan-header" />) as HTMLDivElement
  const board = (<div class="daily-plan-board" />) as HTMLDivElement

  const modal = (
    <div class="modal daily-plan-modal">
      {makeCloseButton(close)}
      {header}
      {board}
    </div>
  ) as HTMLDivElement
  overlay.appendChild(modal)

  const render = (): void => {
    renderHeader(header, render)
    renderBoard(board, render)
  }
  render()

  mount()

  // Deep-link: open the edit form for a specific task (e.g. from a reminder card).
  if (focusTaskId) {
    const task = dailyTaskRepo.getAll().find((t) => t.id === focusTaskId)
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
  const rangeSel = (
    <select class="settings-select daily-compact-range" />
  ) as HTMLSelectElement
  ;[
    ['day', UITexts.DailyPlan.range.today],
    ['3d', UITexts.DailyPlan.range.last3],
    ['7d', UITexts.DailyPlan.range.last7]
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

  const toolbar = (
    <div class="daily-compact-toolbar">
      <div class="daily-compact-title">Daily Plan</div>
      <button
        class="daily-compact-full"
        title={UITexts.DailyPlan.openBoardTitle}
        onClick={() => showDailyPlanModal(selectedDate)}
      >
        ⛶
      </button>
      {rangeSel}
      <button
        class="daily-plan-primary-btn daily-compact-new"
        onClick={() => showTaskForm(null, render, compactStatus)}
      >
        + New
      </button>
    </div>
  ) as HTMLDivElement
  host.appendChild(toolbar)

  // --- Status tab strip (counts per status, current scope) ---------------
  const tabs = (<div class="daily-compact-tabs" />) as HTMLDivElement
  for (const status of STATUSES) {
    const count = tasks.filter((t) => boardColumnOf(t.status) === status.id).length
    const b = (
      <button
        class={'daily-compact-tab' + (compactStatus === status.id ? ' active' : '')}
        onClick={() => {
          compactStatus = status.id
          render()
        }}
      >
        <span>{status.label}</span>
        <span class="daily-compact-tab-count">{String(count)}</span>
      </button>
    ) as HTMLButtonElement
    tabs.appendChild(b)
  }
  host.appendChild(tabs)

  // --- Search ------------------------------------------------------------
  const search = (
    <input
      type="text"
      class="nb-subtab-search"
      placeholder={UITexts.DailyPlan.searchTasks}
      onKeydown={(e: KeyboardEvent) => e.stopPropagation()}
    />
  ) as HTMLInputElement
  search.value = compactSearch
  host.appendChild(search)

  // --- Card list (selected status, filtered by search) -------------------
  const listHost = (<div class="daily-compact-list" />) as HTMLDivElement
  host.appendChild(listHost)

  const fillList = (): void => {
    listHost.replaceChildren()
    const q = compactSearch.trim().toLowerCase()
    const items = tasks
      .filter((t) => boardColumnOf(t.status) === compactStatus)
      .filter((t) => !q || `${t.title} ${t.description ?? ''} ${t.issueKey ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => a.order - b.order)
    if (!items.length) {
      const empty = (
        <div class="daily-compact-empty">{q ? 'No matching tasks' : 'No tasks here'}</div>
      ) as HTMLDivElement
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

  const dateInput = createDateField({
    mode: 'date',
    value: selectedDate,
    className: 'daily-plan-date-input'
  })
  dateInput.addEventListener('change', () => {
    if (dateInput.value) {
      selectedDate = dateInput.value
      rerender()
    }
  })

  const nav = (
    <div class="daily-plan-nav">
      <button
        class="daily-plan-nav-btn"
        title={UITexts.DailyPlan.prevDay}
        onClick={() => {
          selectedDate = shiftDays(selectedDate, -1)
          rerender()
        }}
      >
        ‹
      </button>
      {dateInput}
      <button
        class="daily-plan-nav-btn"
        title={UITexts.DailyPlan.nextDay}
        onClick={() => {
          selectedDate = shiftDays(selectedDate, 1)
          rerender()
        }}
      >
        ›
      </button>
      <button
        class="daily-plan-today-btn"
        onClick={() => {
          selectedDate = todayKey()
          rerender()
        }}
      >
        Today
      </button>
    </div>
  ) as HTMLDivElement

  host.appendChild((<div class="daily-plan-title">Daily Plan</div>) as HTMLDivElement)
  host.appendChild((<div class="daily-plan-subtitle">{formatHeader(selectedDate)}</div>) as HTMLDivElement)
  host.appendChild(nav)

  const actions = document.createElement('div')
  actions.className = 'daily-plan-actions'

  const rangeSel = (<select class="settings-select daily-plan-range" />) as HTMLSelectElement
  ;[
    ['day', UITexts.DailyPlan.range.today],
    ['3d', UITexts.DailyPlan.range.last3],
    ['7d', UITexts.DailyPlan.range.last7]
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

  // Project filter (todo4): show only the selected project's tasks.
  const projFilter = (<select class="settings-select daily-plan-range" />) as HTMLSelectElement
  const allOpt = document.createElement('option')
  allOpt.value = ''
  allOpt.textContent = UITexts.DailyPlan.allProjects
  projFilter.appendChild(allOpt)
  for (const { p, depth } of projectTree()) {
    const o = document.createElement('option')
    o.value = p.id
    o.textContent = '   '.repeat(depth) + (depth ? '└ ' : '') + p.name
    if (p.id === projectFilter) o.selected = true
    projFilter.appendChild(o)
  }
  projFilter.addEventListener('change', () => {
    projectFilter = projFilter.value || null
    rerender()
  })
  actions.appendChild(projFilter)

  const newBtn = (
    <button class="daily-plan-primary-btn" onClick={() => showTaskForm(null, rerender)}>
      + New task
    </button>
  ) as HTMLButtonElement

  const manageBtn = (
    <button class="daily-plan-secondary-btn" onClick={() => showManageTagsModal(rerender)}>
      Manage tags
    </button>
  ) as HTMLButtonElement

  const changelogBtn = (
    <button
      class="daily-plan-secondary-btn"
      title={UITexts.DailyPlan.changelogTitle}
      onClick={() => showChangelogModal()}
    >
      Changelog
    </button>
  ) as HTMLButtonElement

  // Tag filter (multi-select, OR semantics). Only meaningful when tags exist.
  if (dailyTagRepo.getAll().length) {
    const filterBtn = (
      <button
        class={'daily-plan-secondary-btn daily-tagfilter-btn' + (tagFilter.size ? ' active' : '')}
      >
        {tagFilter.size ? UITexts.DailyPlan.filterTagsCount(tagFilter.size) : UITexts.DailyPlan.filterTags}
      </button>
    ) as HTMLButtonElement
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      openTagFilterPopover(filterBtn, rerender)
    })
    actions.append(filterBtn, newBtn, manageBtn, changelogBtn)
  } else {
    actions.append(newBtn, manageBtn, changelogBtn)
  }
  host.appendChild(actions)
}

// Multi-select tag-filter popover anchored under the "Filter tags" button.
// Toggling a tag updates `tagFilter` and re-renders the board live; the popover
// stays open (it lives on document.body, untouched by the header re-render).
function openTagFilterPopover(anchor: HTMLElement, rerender: () => void): void {
  document.querySelector('.daily-tagfilter-pop')?.remove()
  const pop = (<div class="daily-tagfilter-pop" />) as HTMLDivElement
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

  const head = (
    <div class="daily-tagfilter-head">
      <span>Filter by tags</span>
      <button
        class="daily-tagfilter-clear"
        onClick={() => {
          tagFilter.clear()
          rerender()
          closePop()
        }}
      >
        Clear
      </button>
    </div>
  ) as HTMLDivElement
  pop.appendChild(head)

  for (const tag of dailyTagRepo.getAll()) {
    const row = (
      <button class={'daily-tagfilter-row' + (tagFilter.has(tag.id) ? ' active' : '')}>
        <span class="daily-tagfilter-swatch" style={{ backgroundColor: tag.color }} />
        <span class="daily-tagfilter-name">{tag.name}</span>
        <span class="daily-tagfilter-check">✓</span>
      </button>
    ) as HTMLButtonElement
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
    const colTasks = tasks
      .filter((t) => boardColumnOf(t.status) === status.id)
      .sort((a, b) => (multiDay && a.date !== b.date ? a.date.localeCompare(b.date) : a.order - b.order))

    const colCount = (
      <span class="daily-plan-column-count">{String(colTasks.length)}</span>
    ) as HTMLSpanElement

    const search = (
      <input
        type="text"
        class="daily-plan-col-search"
        placeholder="Search…"
        onKeydown={(e: KeyboardEvent) => e.stopPropagation()}
      />
    ) as HTMLInputElement
    search.value = colSearch[status.id] ?? ''
    search.addEventListener('input', () => {
      colSearch[status.id] = search.value
      applyColFilter(body, colCount, status.id)
    })

    const body = (<div class="daily-plan-column-body" />) as HTMLDivElement
    for (const task of colTasks) {
      body.appendChild(renderCard(task, rerender))
    }
    if (colTasks.length === 0) {
      body.appendChild((<div class="daily-plan-empty-col">Drop tasks here</div>) as HTMLDivElement)
    }

    const col = (
      <div class="daily-plan-column" dataset={{ status: status.id }}>
        <div class="daily-plan-column-head">
          <span class="daily-plan-column-title">{status.label}</span>
          {colCount}
        </div>
        {search}
        {body}
      </div>
    ) as HTMLDivElement

    wireDropTarget(body, status.id, rerender)
    applyColFilter(body, colCount, status.id) // re-apply a persisted search query
    host.appendChild(col)
  }
}

// ---- Card --------------------------------------------------------------

function renderCard(task: DailyPlanTask, rerender: () => void): HTMLElement {
  // Searchable text for the per-column filter (title + description + issue key + slug).
  const searchText =
    `${task.title} ${task.description ?? ''} ${task.issueKey ?? ''} ${task.worktreeSlug ?? ''}`.toLowerCase()

  const top = (<div class="daily-plan-card-top" />) as HTMLDivElement

  const dot = (
    <span
      class={`daily-plan-priority-dot priority-${task.priority}`}
      title={`${task.priority[0].toUpperCase() + task.priority.slice(1)} priority`}
    />
  ) as HTMLSpanElement
  top.appendChild(dot)

  // When the task carries a worktree slug, show its full worktree branch name
  // (issue key + slug) as a branch chip; otherwise fall back to the plain issue
  // key chip.
  if (task.worktreeSlug) {
    top.appendChild(
      (
        <span class="daily-plan-card-branch" title="Worktree branch">
          {`⑂ ${task.issueKey ? worktreeBranchForTask(task, task.issueKey) : sanitizeSlug(task.worktreeSlug)}`}
        </span>
      ) as HTMLSpanElement
    )
  } else if (task.issueKey) {
    top.appendChild((<span class="daily-plan-card-key">{task.issueKey}</span>) as HTMLSpanElement)
  }

  // Review/Test tasks share the In Progress column, so a small badge sets them apart.
  if (task.status === 'review') {
    top.appendChild((<span class="daily-plan-card-review">Review</span>) as HTMLSpanElement)
  } else if (task.status === 'test') {
    top.appendChild((<span class="daily-plan-card-test">Test</span>) as HTMLSpanElement)
  }

  const cardActions = (
    <div class="daily-plan-card-actions">
      <button
        class="daily-plan-card-icon"
        title="Open in Claude terminal"
        onClick={(e: MouseEvent) => {
          e.stopPropagation()
          void openTaskInTerminal(task, rerender)
        }}
      >
        ▶
      </button>
      <button
        class="daily-plan-card-icon"
        title="Remind me"
        onClick={(e: MouseEvent) => {
          e.stopPropagation()
          showRemindModal(task.title, task.title, { kind: 'dailyTask', taskId: task.id })
        }}
      >
        ⏰
      </button>
      <button
        class="daily-plan-card-icon"
        title="Edit"
        onClick={(e: MouseEvent) => {
          e.stopPropagation()
          showTaskForm(task, rerender)
        }}
      >
        ✎
      </button>
      <button
        class="daily-plan-card-icon"
        title="Delete"
        onClick={async (e: MouseEvent) => {
          e.stopPropagation()
          const ok = await promptConfirm({
            title: 'Delete task',
            message: `Delete "${task.title}"?`,
            confirmText: 'Delete'
          })
          if (!ok) return
          dailyTaskRepo.remove(task.id)
          rerender()
        }}
      >
        ×
      </button>
    </div>
  ) as HTMLDivElement
  top.appendChild(cardActions)

  // The title is rendered below the meta row as a full-width block (appended
  // after `top`), so long titles read on their own line instead of being
  // squeezed between the key chip and the action icons.
  const title = (<div class="daily-plan-card-title">{task.title}</div>) as HTMLDivElement

  const card = (
    <div class={`daily-plan-card priority-${task.priority}`} dataset={{ taskId: task.id, search: searchText }}>
      {top}
      {title}
    </div>
  ) as HTMLDivElement
  card.draggable = true

  card.addEventListener('dragstart', (e) => {
    card.classList.add('dragging')
    e.dataTransfer?.setData('text/plain', task.id)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  })
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging')
  })

  // Due date: show the time left (or overdue) for unfinished tasks; finished
  // ones just show the date so the urgency colours don't linger.
  if (task.dueDate) {
    const due = document.createElement('div')
    due.className = 'daily-plan-card-due'
    if (task.status === 'done') {
      due.classList.add('done')
      due.textContent = `Due ${shortDue(task.dueDate)}`
    } else {
      const info = dueInfo(task.dueDate)
      due.classList.add(info.cls)
      due.textContent = info.label
    }
    card.appendChild(due)
  }

  // In a multi-day range view, surface which day each card belongs to.
  if (selectedRange !== 'day') {
    const d = parseYmd(task.date)
    const today = todayKey()
    const dateLabel =
      task.date === today
        ? 'Today'
        : task.date === shiftDays(today, -1)
          ? 'Yesterday'
          : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    card.appendChild((<div class="daily-plan-card-date">{dateLabel}</div>) as HTMLDivElement)
  }

  if (task.description && task.description.trim()) {
    card.appendChild(
      (<div class="daily-plan-card-desc">{task.description.trim()}</div>) as HTMLDivElement
    )
  }

  if (task.tagIds.length) {
    const tagRow = (<div class="daily-plan-card-tags" />) as HTMLDivElement
    for (const tagId of task.tagIds) {
      const tag = tagById(tagId)
      if (!tag) continue
      tagRow.appendChild(
        (
          <span class="daily-plan-tag-chip" style={{ backgroundColor: tag.color }}>
            {tag.name}
          </span>
        ) as HTMLSpanElement
      )
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
    const task = dailyTaskRepo.getAll().find((t) => t.id === id)
    if (!task) return

    const before = findInsertBefore(body, e.clientY)
    task.status = status
    // In a single-day view a drop re-homes the task to that day; in a multi-day
    // range view keep the task's own date and only change its status.
    if (selectedRange === 'day') task.date = selectedDate
    task.updatedAt = Date.now()
    reorderWithin(task, status, before)
    dailyTaskRepo.upsert(task)
    rerender()
  })
}

// ---- Task form (create / edit) ----------------------------------------

function showTaskForm(
  existing: DailyPlanTask | null,
  onSaved: () => void,
  defaultStatus: DailyPlanStatus = 'todo'
): void {
  const { overlay, mount, close, onClose } = createOverlay()
  overlay.classList.add('daily-plan-form-overlay')

  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  }
  onClose(() => document.removeEventListener('keydown', onKey, true))
  document.addEventListener('keydown', onKey, true)

  // Title
  const titleInput = (<textarea class="daily-plan-title-input" placeholder="What needs doing?" />) as HTMLTextAreaElement
  titleInput.rows = 2
  titleInput.value = existing?.title ?? ''
  const titleField = (
    <div class="field daily-plan-text-field">
      <label>Title</label>
      {titleInput}
    </div>
  ) as HTMLDivElement

  // Description (optional)
  const descInput = (<textarea class="daily-plan-desc-input" placeholder="Notes, links, context…" />) as HTMLTextAreaElement
  descInput.rows = 3
  descInput.value = existing?.description ?? ''
  const descField = (
    <div class="field daily-plan-text-field">
      <label>
        Description <span class="field-hint">(optional)</span>
      </label>
      {descInput}
    </div>
  ) as HTMLDivElement

  // Tags
  const tagPicker = (<div class="daily-plan-tag-picker" />) as HTMLDivElement
  const tagField = (
    <div class="field">
      <label>Tags</label>
      {tagPicker}
    </div>
  ) as HTMLDivElement

  const selectedTagIds: string[] = [...(existing?.tagIds ?? [])]
  buildTagPicker(tagPicker, selectedTagIds)

  // Project (required) — provides the terminal cwd and the issue-key prefix used
  // to assign the task's stable issue key immediately on save.
  const projSel = document.createElement('select')
  const noneOpt = document.createElement('option')
  noneOpt.value = ''
  noneOpt.textContent = '— Select a project —'
  projSel.appendChild(noneOpt)
  const projectList = projectTree()
  const projects = projectList.map((x) => x.p)
  for (const { p, depth } of projectList) {
    const o = document.createElement('option')
    o.value = p.id
    const label = p.issueKeyPrefix ? `${p.name} (${p.issueKeyPrefix})` : p.name
    // Indent sub-projects so the project hierarchy reads in the dropdown (todo5).
    o.textContent = '   '.repeat(depth) + (depth ? '└ ' : '') + label
    projSel.appendChild(o)
  }
  projSel.value = existing?.projectId ?? ''
  const projHint = (<div class="daily-plan-proj-hint" />) as HTMLDivElement
  const updateProjHint = (): void => {
    const p = projSel.value ? projects.find((x) => x.id === projSel.value) : null
    projHint.textContent = p ? p.path : ''
  }
  projSel.addEventListener('change', () => {
    updateProjHint()
    if (projSel.value) projSel.classList.remove('field-invalid')
  })
  updateProjHint()
  // Wrap the select + path hint in a column so the select keeps the same width
  // as the other fields and the hint sits beneath it (not squeezed beside it).
  const projField = (
    <div class="field">
      <label>Project</label>
      <div class="field-control-col">
        {projSel}
        {projHint}
      </div>
    </div>
  ) as HTMLDivElement

  // Status
  const statusSel = document.createElement('select')
  for (const s of FORM_STATUSES) {
    const o = document.createElement('option')
    o.value = s.id
    o.textContent = s.label
    statusSel.appendChild(o)
  }
  statusSel.value = existing?.status ?? defaultStatus
  const statusField = (
    <div class="field">
      <label>Status</label>
      {statusSel}
    </div>
  ) as HTMLDivElement

  // Priority
  const prioSel = document.createElement('select')
  for (const p of PRIORITIES) {
    const o = document.createElement('option')
    o.value = p.id
    o.textContent = p.label
    prioSel.appendChild(o)
  }
  prioSel.value = existing?.priority ?? 'medium'
  const prioField = (
    <div class="field">
      <label>Priority</label>
      {prioSel}
    </div>
  ) as HTMLDivElement

  // Date
  const dateInput = createDateField({ mode: 'date', value: existing?.date ?? selectedDate })
  const dateField = (
    <div class="field">
      <label>Date</label>
      {dateInput}
    </div>
  ) as HTMLDivElement

  // Due date (optional) — when set, cards show the time left / overdue.
  const dueInput = createDateField({ mode: 'date', value: existing?.dueDate ?? '' })
  const dueField = (
    <div class="field">
      <label>
        Due date <span class="field-hint">(optional)</span>
      </label>
      {dueInput}
    </div>
  ) as HTMLDivElement

  // Worktree slug (optional) — when set, it's appended to the issue key for the
  // worktree branch/name (e.g. CRF-12 → CRF-12-fix-login). Empty → the worktree is
  // named by the issue key alone.
  const slugInput = (<input type="text" placeholder="e.g. fix-login" />) as HTMLInputElement
  slugInput.value = existing?.worktreeSlug ?? ''
  const slugHint = (<div class="daily-plan-proj-hint" />) as HTMLDivElement
  const updateSlugHint = (): void => {
    const slug = sanitizeSlug(slugInput.value)
    if (!slug) {
      slugHint.textContent = ''
      return
    }
    const p = projSel.value ? projects.find((x) => x.id === projSel.value) : null
    const keyPreview =
      existing?.issueKey ?? (p?.issueKeyPrefix?.trim() ? `${p.issueKeyPrefix.trim()}-#` : 'KEY')
    slugHint.textContent = `Worktree: ${keyPreview}-${slug}`
  }
  slugInput.addEventListener('input', updateSlugHint)
  projSel.addEventListener('change', updateSlugHint)
  updateSlugHint()
  const slugField = (
    <div class="field">
      <label>
        Worktree slug <span class="field-hint">(optional)</span>
      </label>
      <div class="field-control-col">
        {slugInput}
        {slugHint}
      </div>
    </div>
  ) as HTMLDivElement

  // Persist the form into a task (updating `existing` or creating a new one) and
  // return it; null when the title is empty. Shared by Save and Remind.
  const commit = (): DailyPlanTask | null => {
    const title = titleInput.value.trim()
    if (!title) {
      titleInput.focus()
      return null
    }
    // Project is required so every task gets a stable issue key assigned the
    // moment it's created (the key derives from the project's prefix).
    if (!projSel.value) {
      projSel.classList.add('field-invalid')
      projSel.focus()
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
      existing.dueDate = dueInput.value || undefined
      existing.tagIds = selectedTagIds.slice()
      existing.projectId = projSel.value || undefined
      existing.worktreeSlug = sanitizeSlug(slugInput.value) || undefined
      existing.updatedAt = now
      assignIssueKey(existing)
      dailyTaskRepo.upsert(existing)
      return existing
    }
    const newTask: DailyPlanTask = {
      id: uid('task'),
      title,
      description: description || undefined,
      date: dateInput.value || selectedDate,
      dueDate: dueInput.value || undefined,
      status: statusSel.value as DailyPlanStatus,
      priority: prioSel.value as DailyPlanPriority,
      tagIds: selectedTagIds.slice(),
      projectId: projSel.value || undefined,
      worktreeSlug: sanitizeSlug(slugInput.value) || undefined,
      order: nextOrder(dateInput.value || selectedDate, statusSel.value as DailyPlanStatus),
      createdAt: now,
      updatedAt: now
    }
    dailyTaskRepo.upsert(newTask)
    // Assign the stable issue key immediately on creation (idempotent — it stays
    // fixed for the task's lifetime).
    assignIssueKey(newTask)
    return newTask
  }

  // Actions
  const save = (<button class="button-primary">Save</button>) as HTMLButtonElement
  save.addEventListener('click', () => {
    if (!commit()) return
    close()
    onSaved()
  })
  const actions = (
    <div class="modal-actions">
      <button onClick={() => close()}>Cancel</button>
      <button
        title="Save and set a reminder for this task"
        onClick={() => {
          const task = commit()
          if (!task) return
          close()
          onSaved()
          showRemindModal(task.title, task.title, { kind: 'dailyTask', taskId: task.id })
        }}
      >
        ⏰ Remind…
      </button>
      <button
        title="Save and open a Claude session seeded with this task"
        onClick={() => {
          const task = commit()
          if (!task) return
          close()
          onSaved()
          void openTaskInTerminal(task, onSaved)
        }}
      >
        ▶ Run in claude session
      </button>
      <button
        title="Create a worktree (branch = issue key) and run the Claude session there"
        onClick={() => {
          const task = commit()
          if (!task) return
          close()
          onSaved()
          void openTaskInTerminal(task, onSaved, true)
        }}
      >
        ⑂ Run in worktree
      </button>
      {save}
    </div>
  ) as HTMLDivElement

  const modal = (
    <div class="modal modal-prompt daily-plan-form">
      {makeCloseButton(close)}
      <h2>{existing ? 'Edit task' : 'New task'}</h2>
      {titleField}
      {descField}
      {tagField}
      {projField}
      {statusField}
      {prioField}
      {dateField}
      {dueField}
      {slugField}
      {actions}
    </div>
  ) as HTMLDivElement
  overlay.appendChild(modal)

  mount()
  titleInput.focus()
  titleInput.select()
}

// ---- Tag multi-select picker (used inside the task form) --------------

function buildTagPicker(host: HTMLElement, selectedIds: string[]): void {
  host.innerHTML = ''

  const chipBar = (<div class="daily-plan-tag-chipbar" />) as HTMLDivElement
  host.appendChild(chipBar)

  const renderChips = (): void => {
    chipBar.innerHTML = ''
    for (const tagId of selectedIds) {
      const tag = tagById(tagId)
      if (!tag) continue
      const x = (<button class="daily-plan-tag-chip-x">×</button>) as HTMLButtonElement
      x.addEventListener('click', () => {
        const i = selectedIds.indexOf(tagId)
        if (i >= 0) selectedIds.splice(i, 1)
        renderChips()
      })
      const chip = (
        <span class="daily-plan-tag-chip removable" style={{ backgroundColor: tag.color }}>
          {tag.name}
          {x}
        </span>
      ) as HTMLSpanElement
      chipBar.appendChild(chip)
    }
  }

  const input = (
    <input type="text" class="daily-plan-tag-input" placeholder="Search or create tag…" />
  ) as HTMLInputElement
  host.appendChild(input)

  const dropdown = (<div class="daily-plan-tag-dropdown" />) as HTMLDivElement
  dropdown.hidden = true
  host.appendChild(dropdown)

  // -1 = no keyboard highlight (Enter falls back to exact-match/create). Arrow keys
  // move it across the rendered options; reset whenever the option list rebuilds.
  let activeIndex = -1
  const options = (): HTMLButtonElement[] =>
    Array.from(dropdown.querySelectorAll<HTMLButtonElement>('.daily-plan-tag-option'))
  const applyHighlight = (): void => {
    options().forEach((opt, i) => {
      const on = i === activeIndex
      opt.classList.toggle('active', on)
      if (on) opt.scrollIntoView({ block: 'nearest' })
    })
  }

  const renderDropdown = (): void => {
    dropdown.innerHTML = ''
    activeIndex = -1
    const q = input.value.trim().toLowerCase()
    const matches = dailyTagRepo.getAll()
      .filter((t) => !selectedIds.includes(t.id) && (!q || t.name.toLowerCase().includes(q)))
      .slice(0, 20)
    for (const tag of matches) {
      const row = (
        <button class="daily-plan-tag-option">
          <span class="daily-plan-tag-swatch" style={{ backgroundColor: tag.color }} />
          <span>{tag.name}</span>
        </button>
      ) as HTMLButtonElement
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
    const exact = dailyTagRepo.getAll().some((t) => t.name.toLowerCase() === q)
    if (q && !exact) {
      const create = (
        <button class="daily-plan-tag-option create">{`+ Create "${input.value.trim()}"`}</button>
      ) as HTMLButtonElement
      create.addEventListener('mousedown', (e) => {
        e.preventDefault()
        const tag: DailyPlanTag = {
          id: uid('tag'),
          name: input.value.trim(),
          color: nextTagColor()
        }
        dailyTagRepo.upsert(tag)
        selectedIds.push(tag.id)
        input.value = ''
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
  // Enter: select the tag whose name exactly matches the query (if one exists),
  // otherwise create a new tag with the typed text. Partial matches don't trigger
  // a select — you get exactly the tag you typed, or a fresh one.
  const selectOrCreate = (): void => {
    const name = input.value.trim()
    if (!name) return
    let tag = dailyTagRepo.getAll().find((t) => t.name.toLowerCase() === name.toLowerCase())
    if (!tag) {
      tag = { id: uid('tag'), name, color: nextTagColor() }
      dailyTagRepo.upsert(tag)
    }
    if (!selectedIds.includes(tag.id)) selectedIds.push(tag.id)
    input.value = ''
    renderChips()
    renderDropdown()
    input.focus()
  }

  // The task form swallows keydown at document capture (stopPropagation) to keep
  // global shortcuts from firing, which also prevents an input-level keydown from
  // ever running. Listen on document capture too (same target → not blocked by the
  // form's stopPropagation) and act only while this input is focused. Self-removes
  // once the input leaves the DOM, so it doesn't outlive the modal.
  const onNavKey = (e: KeyboardEvent): void => {
    if (!input.isConnected) {
      document.removeEventListener('keydown', onNavKey, true)
      return
    }
    if (document.activeElement !== input) return
    const opts = options()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (opts.length) {
        activeIndex = activeIndex + 1 >= opts.length ? 0 : activeIndex + 1
        applyHighlight()
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (opts.length) {
        activeIndex = activeIndex <= 0 ? opts.length - 1 : activeIndex - 1
        applyHighlight()
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // A highlighted option wins; otherwise fall back to exact-match-or-create.
      if (activeIndex >= 0 && opts[activeIndex]) opts[activeIndex].dispatchEvent(new MouseEvent('mousedown'))
      else selectOrCreate()
    }
  }
  document.addEventListener('keydown', onNavKey, true)

  renderChips()
}

// ---- Manage tags modal -------------------------------------------------

function showManageTagsModal(rerender: () => void): void {
  const { overlay, mount, close, onClose } = createOverlay()
  overlay.classList.add('daily-plan-form-overlay')

  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  }
  onClose(() => {
    document.removeEventListener('keydown', onKey, true)
    rerender()
  })
  document.addEventListener('keydown', onKey, true)

  const list = (<div class="daily-plan-tags-list" />) as HTMLDivElement

  const modal = (
    <div class="modal modal-prompt daily-plan-tags-modal">
      {makeCloseButton(close)}
      <h2>Manage tags</h2>
      {list}
    </div>
  ) as HTMLDivElement
  overlay.appendChild(modal)

  const renderList = (): void => {
    list.innerHTML = ''
    if (!dailyTagRepo.getAll().length) {
      list.appendChild(
        (
          <div class="daily-plan-tags-empty">No tags yet. Create one from the task form.</div>
        ) as HTMLDivElement
      )
      return
    }
    for (const tag of dailyTagRepo.getAll()) {
      const color = (<input type="color" class="daily-plan-tag-color" />) as HTMLInputElement
      color.value = tag.color
      color.addEventListener('change', () => {
        tag.color = color.value
        dailyTagRepo.upsert(tag)
      })

      const name = (<input type="text" class="daily-plan-tag-name" />) as HTMLInputElement
      name.value = tag.name
      name.addEventListener('change', () => {
        const v = name.value.trim()
        if (v) {
          tag.name = v
          dailyTagRepo.upsert(tag)
        } else {
          name.value = tag.name
        }
      })

      const del = (<button class="daily-plan-tag-delete">Delete</button>) as HTMLButtonElement
      del.addEventListener('click', async () => {
        const ok = await promptConfirm({
          title: 'Delete tag',
          message: `Delete "${tag.name}"? It will be removed from every task.`,
          confirmText: 'Delete'
        })
        if (!ok) return
        dailyTaskRepo.remove(tag.id)
        for (const t of dailyTaskRepo.getAll()) {
          if (!t.tagIds.includes(tag.id)) continue
          t.tagIds = t.tagIds.filter((id) => id !== tag.id)
          dailyTaskRepo.upsert(t)
        }
        tagFilter.delete(tag.id) // drop from the active filter so the board isn't stranded empty
        renderList()
      })

      const row = (
        <div class="daily-plan-tag-row">
          {color}
          {name}
          {del}
        </div>
      ) as HTMLDivElement
      list.appendChild(row)
    }
  }
  renderList()

  mount()
}

// ---- Changelog report --------------------------------------------------

// Modal: pick projects + a day range, then generate a copyable markdown changelog
// of completed tasks for customers.
export function showChangelogModal(): void {
  const { overlay, mount, close, onClose } = createOverlay()
  overlay.classList.add('daily-plan-form-overlay')

  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  }
  onClose(() => document.removeEventListener('keydown', onKey, true))
  document.addEventListener('keydown', onKey, true)

  // Range select
  const rangeSel = (<select class="settings-select" />) as HTMLSelectElement
  for (const r of CHANGELOG_RANGES) {
    const o = document.createElement('option')
    o.value = r.id
    o.textContent = r.label
    rangeSel.appendChild(o)
  }
  rangeSel.value = 'today'
  const rangeField = (
    <div class="field">
      <label>Date range</label>
      {rangeSel}
    </div>
  ) as HTMLDivElement

  // Generate + output
  const output = (
    <textarea
      class="changelog-output"
      placeholder='Click "Generate" to produce the changelog markdown…'
      onKeydown={(e: KeyboardEvent) => e.stopPropagation()}
    />
  ) as HTMLTextAreaElement
  output.rows = 14

  const copyBtn = (<button>Copy</button>) as HTMLButtonElement
  copyBtn.disabled = true
  copyBtn.addEventListener('click', () => {
    void navigator.clipboard.writeText(output.value)
    const prev = copyBtn.textContent
    copyBtn.textContent = 'Copied!'
    setTimeout(() => (copyBtn.textContent = prev), 1200)
  })

  const generateBtn = (<button class="button-primary">Generate</button>) as HTMLButtonElement
  generateBtn.addEventListener('click', () => {
    output.value = buildChangelogMarkdown(rangeSel.value)
    copyBtn.disabled = false
  })

  const actions = (
    <div class="modal-actions">
      {generateBtn}
      {copyBtn}
    </div>
  ) as HTMLDivElement

  const modal = (
    <div class="modal modal-prompt changelog-modal">
      {makeCloseButton(close)}
      <h2>Changelog report</h2>
      {rangeField}
      {output}
      {actions}
    </div>
  ) as HTMLDivElement
  overlay.appendChild(modal)

  mount()
}
