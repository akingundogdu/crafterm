import '@views/screens/daily-plan/daily-plan.css'
import { UITexts } from '@texts'
import type { DailyPlanTask, DailyPlanStatus } from '@views/types/types'
import type { DailyRange } from '@views/screens/daily-plan/daily-plan.types'
import { state } from '@views/state/spine'
import { dailyTaskRepo } from '@repositories'
import { promptConfirm } from '@views/components/dialog/confirm'
import { findProjectById } from '@views/catalog/catalog'
import { openClaudeWithPrompt } from '@views/commands/commands'
import { ensureWorktreeForBranch } from '@services/worktrees'
import { createOverlay } from '@views/components/overlay/overlay'
import { makeCloseButton } from '@views/components/dialog/close-button'
import { shiftDays } from '@views/screens/daily-plan/task-helpers'
import {
  todayKey,
  tasksFor,
  assignIssueKey,
  worktreeBranchForTask
} from '@views/screens/daily-plan/daily-plan.state'
import { openTaskForm } from './components/task-form.open'
import { renderCard as buildCard } from './components/compact-card'
import { openTagFilterPopover as buildTagFilterPopover } from './components/tag-filter-popover'
import { renderDailyCompactView } from './components/daily-compact'
import DailyPlanBoard from './daily-plan'
import store from './daily-plan.store'

// Modal + compact + terminal entries for the Daily Plan, migrated out of the
// legacy @ui daily-plan.tsx. The gea board (daily-plan.tsx) is the reactive
// columns view; this module owns the orchestration around it — the create/edit
// form, the wide-board overlay, the compact (Notebook) view, the tag filter, and
// the run-in-terminal flow — plus the board-shared module state they read. The
// pane-assignment helpers stay in @ui (they touch the pane Maps / pane menu).
// Self-contained — no @ui (§2.7).

let selectedRange: DailyRange = 'day'
// Board project filter (todo4): null = all projects, else only this project's tasks.
let projectFilter: string | null = null

// Active tag filter (tag ids). Empty = no filter. A task matches when it carries
// ANY of the selected tags (OR semantics). Shared with the gea board store + the
// legacy compact view via this module-level Set.
export const tagFilter = new Set<string>()

function matchesTagFilter(task: DailyPlanTask): boolean {
  if (!tagFilter.size) return true
  return task.tagIds.some((id) => tagFilter.has(id))
}

// Tasks shown for the current compact scope. Day-based YMD keys compare
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
  return inScope.filter(matchesTagFilter).filter((t) => !projectFilter || t.projectId === projectFilter)
}

// Open the create/edit task form, wiring the board's live selected date + the
// terminal-launch action into the form. Keeps the historic (existing, onSaved,
// defaultStatus) signature so every call site is unchanged.
export function showTaskForm(
  existing: DailyPlanTask | null,
  onSaved: () => void,
  defaultStatus: DailyPlanStatus = 'todo'
): void {
  openTaskForm({
    existing,
    onSaved,
    defaultStatus,
    getSelectedDate: () => selectedDate,
    openTaskInTerminal: (task, onChange, useWorktree) => void openTaskInTerminal(task, onChange, useWorktree)
  })
}

// Build a compact-view task card, wiring the live range + actions into the
// extracted card builder.
function renderCard(task: DailyPlanTask, rerender: () => void): HTMLElement {
  return buildCard({
    task,
    rerender,
    getSelectedRange: () => selectedRange,
    openTaskInTerminal: (t, onChange, useWorktree) => void openTaskInTerminal(t, onChange, useWorktree),
    showTaskForm: (existing, onSaved) => showTaskForm(existing, onSaved)
  })
}

// Open a Claude terminal in the task's project, seeded with title + description and
// titled by the issue key. Warns (and aborts) when no project / prefix is set.
export async function openTaskInTerminal(
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
  // Title the terminal by the work (renameable); the issue key is shown as a "(KEY)"
  // suffix in the sidebar via the dailyTaskId link, not baked into the editable
  // title (todo14). Auto-assign to this task (full match — see todo50).
  await openClaudeWithPrompt(parentId, cwd, prompt, task.title, task.id)
}

// ---- Main entry --------------------------------------------------------

let selectedDate = todayKey()

export function showDailyPlanModal(initialDate?: string, focusTaskId?: string): void {
  store.setSelectedDate(initialDate ?? todayKey())
  store.reload()

  const { overlay, mount, close, onClose } = createOverlay()

  const onKey = (e: KeyboardEvent): void => {
    // Defer to a child form modal or an open tag-filter popover (they handle Esc).
    if (document.querySelector('.daily-plan-form-overlay') || document.querySelector('.daily-tagfilter-pop')) return
    e.stopPropagation()
    if (e.key === 'Escape') {
      close()
    } else if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'n') {
      e.preventDefault()
      showTaskForm(null, () => store.reload())
    }
  }
  onClose(() => document.removeEventListener('keydown', onKey, true))
  document.addEventListener('keydown', onKey, true)

  const modal = document.createElement('div')
  modal.className = 'modal daily-plan-modal'
  modal.appendChild(makeCloseButton(close))
  // Mount the gea board (header + reactive columns) into the overlay modal shell.
  new DailyPlanBoard().render(modal)
  overlay.appendChild(modal)

  mount()

  // Deep-link: open the edit form for a specific task (e.g. from a reminder card).
  if (focusTaskId) {
    const task = dailyTaskRepo.getAll().find((t) => t.id === focusTaskId)
    if (task) showTaskForm(task, () => store.reload())
  }
}

// Last in-place re-render of the docked daily panel (right panel or Notebook
// sub-tab). Lets the global Cmd+N shortcut open the task form and refresh the board
// even though it has no direct handle to the panel's render closure.
let activeDailyRerender: (() => void) | null = null

// Compact Daily Plan view for the narrow Notebook sub-tab. Module-mutable compact
// state (status + search) persists across re-renders.
let compactStatus: DailyPlanStatus = 'todo'
let compactSearch = ''

export function renderDailyCompact(host: HTMLElement): void {
  renderDailyCompactView(host, {
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
  })
}

// Refresh the docked daily view (if mounted) — used by the @ui pane-assignment
// helpers that mutate a bound task's status outside the board.
export function triggerActiveDailyRerender(): void {
  activeDailyRerender?.()
}

// Current compact status — used by the @ui Cmd+N entry (openNewDailyTask) so a new
// task lands in the column the compact view is showing.
export function getCompactStatus(): DailyPlanStatus {
  return compactStatus
}

// Open the tag-filter popover anchored under its button, wiring the active tag
// filter + board re-render into the extracted component.
export function openTagFilterPopover(anchor: HTMLElement, rerender: () => void): void {
  buildTagFilterPopover({ anchor, tagFilter, rerender })
}
