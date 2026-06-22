import './daily-plan.css'
import { UITexts } from '@texts'
import type {
  DailyPlanTask,
  DailyPlanStatus
} from '@ui/types/types'
import type { DailyRange } from './daily-plan.types'
import { state, panes } from '@ui/state/state'
import { dailyTaskRepo, dailyTagRepo } from '@repositories'
import { promptConfirm } from '@ui/components/dialog/dialog'
import { findProjectById } from '@ui/catalog/catalog'
import { openClaudeWithPrompt } from '@ui/commands/commands'
import { ensureWorktreeForBranch, worktreeNodeForBranch, removeWorktree } from '@services/worktrees'
import { refreshPaneDailyTask } from '@ui/pane/pane'
import { createDateField } from '@ui/components'
import { boardColumnOf, shiftDays } from './task-helpers'
import {
  STATUSES,
  todayKey,
  formatHeader,
  tasksFor,
  assignIssueKey,
  worktreeBranchForTask,
  projectTree,
  taskById,
  findInsertBefore,
  reorderWithin
} from './daily-plan.state'
import { renderCard as buildCard } from './components/task-card'
import { showTaskForm as buildTaskForm } from './components/task-form'
import { showManageTagsModal as buildManageTagsModal } from './components/manage-tags-modal'
import { showChangelogModal } from './components/changelog-modal'
import { openTagFilterPopover as buildTagFilterPopover } from './components/tag-filter-popover'
import { assignPaneToTask as buildAssignPaneToTask } from './components/assign-task-modal'
import { DailyPlanModalController, DailyCompactController } from './daily-plan.controller'

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

// Open the create/edit task form, wiring the board's live selected date + the
// terminal-launch action into the extracted form component. Keeps the historic
// (existing, onSaved, defaultStatus) signature so every call site is unchanged.
function showTaskForm(
  existing: DailyPlanTask | null,
  onSaved: () => void,
  defaultStatus: DailyPlanStatus = 'todo'
): void {
  buildTaskForm({
    existing,
    onSaved,
    defaultStatus,
    getSelectedDate: () => selectedDate,
    openTaskInTerminal: (task, onChange, useWorktree) => void openTaskInTerminal(task, onChange, useWorktree)
  })
}

// Build a draggable task card, wiring the board's live range + actions into the
// extracted card component.
function renderCard(task: DailyPlanTask, rerender: () => void): HTMLElement {
  return buildCard({
    task,
    rerender,
    getSelectedRange: () => selectedRange,
    openTaskInTerminal: (t, onChange, useWorktree) => void openTaskInTerminal(t, onChange, useWorktree),
    showTaskForm: (existing, onSaved) => showTaskForm(existing, onSaved)
  })
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
// Delegates to the extracted modal, wiring the board re-render into the form it
// opens for the chosen task.
export function assignPaneToTask(paneId: string): void {
  buildAssignPaneToTask({
    paneId,
    openTaskForm: (t) => showTaskForm(t, () => activeDailyRerender?.())
  })
}

// ---- Main entry --------------------------------------------------------

let selectedDate = todayKey()

export function showDailyPlanModal(initialDate?: string, focusTaskId?: string): void {
  new DailyPlanModalController({
    setSelectedDate: (date) => {
      selectedDate = date
    },
    showTaskForm,
    renderHeader,
    renderBoard
  }).open(initialDate, focusTaskId)
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
  new DailyCompactController(host, {
    getSelectedRange: () => selectedRange,
    setSelectedRange: (range) => {
      selectedRange = range
    },
    getCompactStatus: () => compactStatus,
    setCompactStatus: (status) => {
      compactStatus = status
    },
    getCompactSearch: () => compactSearch,
    setCompactSearch: (search) => {
      compactSearch = search
    },
    setActiveDailyRerender: (render) => {
      activeDailyRerender = render
    },
    getSelectedDate: () => selectedDate,
    tasksForScope,
    showDailyPlanModal,
    showTaskForm,
    renderCard
  }).render()
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

  const rangeSel = (
    <select
      class="settings-select daily-plan-range"
      onChange={() => {
        selectedRange = rangeSel.value as DailyRange
        rerender()
      }}
    >
      {(
        [
          ['day', UITexts.DailyPlan.range.today],
          ['3d', UITexts.DailyPlan.range.last3],
          ['7d', UITexts.DailyPlan.range.last7]
        ] as const
      ).map(([val, label]) => (
        <option value={val} selected={val === selectedRange}>
          {label}
        </option>
      ))}
    </select>
  ) as HTMLSelectElement

  // Project filter (todo4): show only the selected project's tasks.
  const projFilter = (
    <select
      class="settings-select daily-plan-range"
      onChange={() => {
        projectFilter = projFilter.value || null
        rerender()
      }}
    >
      <option value="">{UITexts.DailyPlan.allProjects}</option>
      {projectTree().map(({ p, depth }) => (
        <option value={p.id} selected={p.id === projectFilter}>
          {'   '.repeat(depth) + (depth ? '└ ' : '') + p.name}
        </option>
      ))}
    </select>
  ) as HTMLSelectElement

  const actions = (
    <div class="daily-plan-actions">
      {rangeSel}
      {projFilter}
    </div>
  ) as HTMLDivElement

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
        onClick={(e: MouseEvent) => {
          e.stopPropagation()
          openTagFilterPopover(filterBtn, rerender)
        }}
      >
        {tagFilter.size ? UITexts.DailyPlan.filterTagsCount(tagFilter.size) : UITexts.DailyPlan.filterTags}
      </button>
    ) as HTMLButtonElement
    actions.append(filterBtn, newBtn, manageBtn, changelogBtn)
  } else {
    actions.append(newBtn, manageBtn, changelogBtn)
  }
  host.appendChild(actions)
}

// Open the manage-tags modal, wiring the board re-render + active tag filter into
// the extracted component.
function showManageTagsModal(rerender: () => void): void {
  buildManageTagsModal({ rerender, tagFilter })
}

// Open the tag-filter popover anchored under its button, wiring the active tag
// filter + board re-render into the extracted component.
function openTagFilterPopover(anchor: HTMLElement, rerender: () => void): void {
  buildTagFilterPopover({ anchor, tagFilter, rerender })
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
        onInput={() => {
          colSearch[status.id] = search.value
          applyColFilter(body, colCount, status.id)
        }}
      />
    ) as HTMLInputElement
    search.value = colSearch[status.id] ?? ''

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

export { showChangelogModal }
