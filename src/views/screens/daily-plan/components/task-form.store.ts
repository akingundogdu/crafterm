import { Store } from '@geajs/core'
import type {
  DailyPlanTask,
  DailyPlanStatus,
  DailyPlanPriority
} from '@views/types/types'
import { uid } from '@views/lib/uid'
import { dailyTaskRepo } from '@repositories'
import { assignIssueKey, sanitizeSlug, nextOrder, taskById } from '@views/screens/daily-plan/daily-plan.store'

// Reactive shell + commit logic for the gea create/edit task form. The form's
// inputs are uncontrolled (read from the DOM at commit time) and the imperative
// widgets (two DateFields + the keyboard-driven tag picker) are plain instance
// props embedded via refs — so NO reactive store write fires while editing, which
// would otherwise re-render and wipe the injected widgets. The store therefore
// only holds open-time context (existing/defaultStatus/selectedDate), the
// callbacks, and the commit() persistence. Self-contained — no @ui (§2.7).
export interface TaskCommit {
  title: string
  description: string
  projectId: string
  status: DailyPlanStatus
  priority: DailyPlanPriority
  slug: string
  date: string
  dueDate: string
  tagIds: string[]
}

class TaskFormStore extends Store {
  existing: DailyPlanTask | null = null
  defaultStatus: DailyPlanStatus = 'todo'
  selectedDate = ''

  onSaved: () => void = () => {}
  openTaskInTerminal: (task: DailyPlanTask, onChange: () => void, useWorktree?: boolean) => void = () => {}
  private closeFn: () => void = () => {}

  open(
    existing: DailyPlanTask | null,
    defaultStatus: DailyPlanStatus,
    selectedDate: string,
    onSaved: () => void,
    openTaskInTerminal: (task: DailyPlanTask, onChange: () => void, useWorktree?: boolean) => void,
    close: () => void
  ): void {
    this.existing = existing
    this.defaultStatus = defaultStatus
    this.selectedDate = selectedDate
    this.onSaved = onSaved
    this.openTaskInTerminal = openTaskInTerminal
    this.closeFn = close
  }

  get titleText(): string {
    return this.existing ? 'Edit task' : 'New task'
  }

  // The initial status for the Status select (read once for the `selected` option).
  get initialStatus(): DailyPlanStatus {
    return this.existing?.status ?? this.defaultStatus
  }

  close(): void {
    this.closeFn()
  }

  // Persist the form into a task (updating the existing one or creating a new one)
  // and return it. The caller has already validated title + project. §5.3: an
  // existing task is resolved to its raw repo object before mutation so a reactive
  // proxy is never assigned to.
  commit(c: TaskCommit): DailyPlanTask {
    const now = Date.now()
    const title = c.title.trim()
    const description = c.description.trim()
    const existing = this.existing ? taskById(this.existing.id) ?? this.existing : null
    if (existing) {
      existing.title = title
      existing.description = description || undefined
      existing.status = c.status
      existing.priority = c.priority
      existing.date = c.date || this.selectedDate
      existing.dueDate = c.dueDate || undefined
      existing.tagIds = c.tagIds.slice()
      existing.projectId = c.projectId || undefined
      existing.worktreeSlug = sanitizeSlug(c.slug) || undefined
      existing.updatedAt = now
      assignIssueKey(existing)
      dailyTaskRepo.upsert(existing)
      return existing
    }
    const newTask: DailyPlanTask = {
      id: uid('task'),
      title,
      description: description || undefined,
      date: c.date || this.selectedDate,
      dueDate: c.dueDate || undefined,
      status: c.status,
      priority: c.priority,
      tagIds: c.tagIds.slice(),
      projectId: c.projectId || undefined,
      worktreeSlug: sanitizeSlug(c.slug) || undefined,
      order: nextOrder(c.date || this.selectedDate, c.status),
      createdAt: now,
      updatedAt: now
    }
    dailyTaskRepo.upsert(newTask)
    // Assign the stable issue key immediately on creation (idempotent — it stays
    // fixed for the task's lifetime).
    assignIssueKey(newTask)
    return newTask
  }
}

export default new TaskFormStore()
