import './daily-plan.css'
import type { DailyPlanStatus } from '@ui/types/types'
import { state, panes } from '@ui/state/state'
import { dailyTaskRepo } from '@repositories'
import { findProjectById } from '@ui/catalog/catalog'
import { worktreeNodeForBranch, removeWorktree } from '@services/worktrees'
import { refreshPaneDailyTask } from '@ui/pane/pane'
import { taskById, worktreeBranchForTask } from './daily-plan.state'
import { assignPaneToTask as buildAssignPaneToTask } from './components/assign-task-modal'
import type { DailyPlanTask } from '@ui/types/types'
import {
  showTaskForm,
  openTaskInTerminal,
  triggerActiveDailyRerender,
  getCompactStatus
} from '@views/screens/daily-plan/daily-plan.entry'

// Co-existence shim: the Daily Plan board, the create/edit form, the wide-board
// overlay, the compact (Notebook) view, the tag filter and the run-in-terminal
// flow have all moved to the gea tree (`@views/screens/daily-plan`). This module
// re-exports those migrated entries (so legacy importers keep the same names) and
// keeps the pane-assignment helpers, which still touch the pane Maps + the pane
// menu and so live with the un-migrated pane/terminal subsystem.
export {
  tagFilter,
  showTaskForm,
  openTaskInTerminal,
  showDailyPlanModal,
  renderDailyCompact,
  openTagFilterPopover
} from '@views/screens/daily-plan/daily-plan.entry'
export { showChangelogModal } from '@views/screens/daily-plan/components/changelog-modal'

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
  if (t) showTaskForm(t, () => triggerActiveDailyRerender())
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
  triggerActiveDailyRerender()
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
  triggerActiveDailyRerender()
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
  triggerActiveDailyRerender()
}

// When a ticket is marked done from its terminal, offer to remove its worktree
// (the one whose branch == the issue key). removeWorktree shows its own confirm and
// reconcile archives the node afterwards (todo7).
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
    openTaskForm: (t) => showTaskForm(t, () => triggerActiveDailyRerender())
  })
}

// Cmd+N entry point while the Daily Plan view is shown: open the new-task form and
// refresh the docked view on save.
export function openNewDailyTask(): void {
  showTaskForm(null, () => triggerActiveDailyRerender(), getCompactStatus())
}
