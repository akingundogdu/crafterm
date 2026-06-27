import type { DailyPlanData } from '@ui/types/types'

// Daily plan collection (tasks + tags) — extracted from `settings` (was
// settings.dailyPlan). Persisted into the single crafterm-state.json;
// dailyTaskRepo/dailyTagRepo operate on dailyPlan.tasks/.tags. The object and
// its arrays are mutated in place (stable references) so the repo accessors and
// in-place pushes elsewhere stay valid.
export const dailyPlan: DailyPlanData = { tasks: [], tags: [] }

export function setDailyPlan(next: DailyPlanData): void {
  dailyPlan.tasks.length = 0
  dailyPlan.tasks.push(...next.tasks)
  dailyPlan.tags.length = 0
  dailyPlan.tags.push(...next.tags)
}
