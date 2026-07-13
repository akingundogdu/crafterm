import type { DailyPlanStatus, DailyPlanTask } from '@views/types/types'
import { state, panes } from '@views/state/state'
import { dailyTaskRepo } from '@repositories'
import { findProjectById } from '@views/catalog/catalog'
import { worktreeNodeForBranch, removeWorktree } from '@services/worktrees'
import { refreshPaneDailyTask } from '@views/pane/pane'
import { taskById, worktreeBranchForTask } from './daily-plan.store'
import { assignPaneToTask as buildAssignPaneToTask } from './components/assign-task-modal'
import { showTaskForm, triggerActiveDailyRerender, getCompactStatus } from './daily-plan.entry'

// Re-exported so the shell (main.state) imports every daily-plan entry it needs
// from one module.
export { showDailyPlanModal } from './daily-plan.entry'

// Terminal ↔ daily-task assignment glue consumed by the shell (main.state, the
// pane menu, keybindings). These touch the pane Maps + the pane menu, so they
// live alongside the pane/terminal subsystem rather than the daily-plan board.
// Self-contained — no @ui (§2.7).

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
