import { Store } from '@geajs/core'
import type { DailyPlanStatus } from '@views/types/types'
import type { DailyRange } from '@views/screens/daily-plan/daily-plan.types'

// Reactive state for the compact Daily Plan view (narrow Notebook sub-tab). status
// / search / range are the source of truth, read directly in the view's template()
// so gea patches the list on every tab / search / range change — the board pattern
// (daily-plan.store). `rev` is bumped by the external activeDailyRerender hook
// (Cmd+N / pane-assignment) to force a refresh after a repo mutation the view
// didn't drive itself.
class DailyCompactStore extends Store {
  status: DailyPlanStatus = 'todo'
  search = ''
  range: DailyRange = 'day'
  rev = 0

  setStatus(status: DailyPlanStatus): void {
    this.status = status
  }

  setSearch(search: string): void {
    this.search = search
  }

  setRange(range: DailyRange): void {
    this.range = range
  }

  bump(): void {
    this.rev++
  }
}

export default new DailyCompactStore()
