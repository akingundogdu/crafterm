import { Store } from '@geajs/core'
import type { DailyPlanTask, DailyPlanTag, DailyPlanStatus } from '@views/types/types'
import type { DailyRange } from '@views/screens/daily-plan/daily-plan.types'
import { dailyTaskRepo, dailyTagRepo } from '@repositories'
import { boardColumnOf, shiftDays } from '@views/screens/daily-plan/task-helpers'
import { todayKey, reorderWithin, findInsertBefore } from '@views/screens/daily-plan/daily-plan.state'
// Tag filter is shared with the compact view via this module-level Set; the
// tag-filter popover mutates it and calls reload() to refresh us.
import { tagFilter } from './daily-plan.entry'

// Reactive board state for the gea Daily Plan board. The repos remain the
// persisted source of truth; this store mirrors them into reactive arrays so gea
// patches the board on mutation — replacing the legacy manual renderBoard() +
// replaceChildren() cycle. Every mutation persists through the repo, then calls
// reload() to resync the reactive snapshot (keyed lists keep the churn surgical).
class DailyPlanStore extends Store {
  tasks: DailyPlanTask[] = []
  tags: DailyPlanTag[] = []
  selectedDate: string = todayKey()
  selectedRange: DailyRange = 'day'
  projectFilter: string | null = null
  colSearch: Record<string, string> = {}

  reload(): void {
    this.tasks = [...dailyTaskRepo.getAll()]
    this.tags = [...dailyTagRepo.getAll()]
  }

  // Tasks in the active scope (single day or last-N-days), narrowed by the tag
  // and project filters. Derived getter so gea tracks it as a reactive source.
  get scopedTasks(): DailyPlanTask[] {
    const inScope =
      this.selectedRange === 'day'
        ? this.tasks.filter((t) => t.date === this.selectedDate)
        : (() => {
            const span = this.selectedRange === '3d' ? 3 : 7
            const today = todayKey()
            const start = shiftDays(today, -(span - 1))
            return this.tasks.filter((t) => t.date >= start && t.date <= today)
          })()
    return inScope
      .filter((t) => !tagFilter.size || t.tagIds.some((id) => tagFilter.has(id)))
      .filter((t) => !this.projectFilter || t.projectId === this.projectFilter)
  }

  columnTasks(status: DailyPlanStatus): DailyPlanTask[] {
    const multiDay = this.selectedRange !== 'day'
    return this.scopedTasks
      .filter((t) => boardColumnOf(t.status) === status)
      .sort((a, b) => (multiDay && a.date !== b.date ? a.date.localeCompare(b.date) : a.order - b.order))
  }

  setSelectedDate(date: string): void {
    this.selectedDate = date
  }

  shiftSelectedDate(delta: number): void {
    this.selectedDate = shiftDays(this.selectedDate, delta)
  }

  setRange(range: DailyRange): void {
    this.selectedRange = range
  }

  setProjectFilter(id: string | null): void {
    this.projectFilter = id
  }

  setColSearch(status: string, q: string): void {
    this.colSearch[status] = q
  }

  // Drop a task into a column at the position implied by `bodyEl` + cursor Y.
  // Mirrors the legacy wireDropTarget logic, then reloads the reactive snapshot.
  moveTask(taskId: string, status: DailyPlanStatus, bodyEl: HTMLElement, clientY: number): void {
    const task = dailyTaskRepo.getAll().find((t) => t.id === taskId)
    if (!task) return
    const before = findInsertBefore(bodyEl, clientY)
    task.status = status
    if (this.selectedRange === 'day') task.date = this.selectedDate
    task.updatedAt = Date.now()
    reorderWithin(task, status, before)
    dailyTaskRepo.upsert(task)
    this.reload()
  }

  removeTask(id: string): void {
    dailyTaskRepo.remove(id)
    this.reload()
  }
}

export default new DailyPlanStore()
