import { Store } from '@geajs/core'
import type { DailyPlanTask } from '@views/types/types'
import { panes } from '@views/state/state'
import { persistence } from '@repositories/persistence.service'
import { dailyTaskRepo } from '@repositories'
import { refreshPaneDailyTask } from '@views/pane/pane'
import { taskById } from '../daily-plan.store'

// Reactive state + logic for the gea "assign a daily task to a pane" modal (merges
// the legacy imperative AssignTaskModalController). A singleton reset on each open
// (the project-picker pattern): `open()` seeds the pane + callbacks and returns
// false when the pane is gone, the component reads the reactive fields (query,
// candidates, current), and `assign()` writes the pane's task then opens the form.
// Self-contained — no @ui (§2.7).
class AssignTaskModalStore extends Store {
  query = ''
  candidates: DailyPlanTask[] = []
  current: DailyPlanTask | null = null

  private paneId = ''
  private openTaskForm: (task: DailyPlanTask) => void = () => {}
  private closeFn: () => void = () => {}

  // Seed open-time context. Returns false (caller aborts) when the pane is gone.
  open(paneId: string, openTaskForm: (task: DailyPlanTask) => void, close: () => void): boolean {
    this.query = ''
    this.paneId = paneId
    this.openTaskForm = openTaskForm
    this.closeFn = close
    const pane = panes.get(paneId)
    if (!pane) return false
    this.current = pane.dailyTaskId ? taskById(pane.dailyTaskId) ?? null : null
    // Candidate tasks: not done, most recent first, capped in `items`.
    this.candidates = dailyTaskRepo
      .getAll()
      .filter((t) => t.status !== 'done')
      .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)
    return true
  }

  // Filtered candidate list the component maps over (capped at 50).
  get items(): DailyPlanTask[] {
    const q = this.query.trim().toLowerCase()
    return this.candidates
      .filter((t) => !q || `${t.title} ${t.issueKey ?? ''}`.toLowerCase().includes(q))
      .slice(0, 50)
  }

  // Label for the current-assignment row; blank when nothing is assigned.
  get currentLabel(): string {
    if (!this.current) return ''
    return `Current: ${this.current.issueKey ? this.current.issueKey + ' · ' : ''}${this.current.title}`
  }

  close(): void {
    this.closeFn()
  }

  // Assign (or clear) the pane's daily task, persist, refresh the pane, close, and
  // open the task form for the freshly-assigned task so its status can be updated.
  assign(taskId: string | null): void {
    const pane = panes.get(this.paneId)
    if (!pane) return
    pane.dailyTaskId = taskId
    persistence.save()
    refreshPaneDailyTask(this.paneId)
    this.closeFn()
    if (taskId) {
      const t = taskById(taskId)
      if (t) this.openTaskForm(t)
    }
  }
}

export default new AssignTaskModalStore()
