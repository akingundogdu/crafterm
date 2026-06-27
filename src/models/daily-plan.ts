import type { DailyTask } from './daily-task'
import type { DailyTag } from './daily-tag'

// Daily plan live collection (tasks + tags) — mirrors `DailyPlanData` in types.ts.
// Persisted into the single crafterm-state.json; dailyTaskRepo/dailyTagRepo
// operate on dailyPlan.tasks/.tags. The object + arrays are mutated in place
// (stable refs). Kept @ui-independent so it typechecks under the node project too.
export interface DailyPlan {
  tasks: DailyTask[]
  tags: DailyTag[]
}

export const dailyPlan: DailyPlan = { tasks: [], tags: [] }

export function setDailyPlan(next: DailyPlan): void {
  dailyPlan.tasks.length = 0
  dailyPlan.tasks.push(...next.tasks)
  dailyPlan.tags.length = 0
  dailyPlan.tags.push(...next.tags)
}
