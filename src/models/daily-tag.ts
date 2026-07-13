import { z } from 'zod'

// Daily-plan tag — table-oriented domain model (§3.12). Mirrors the current
// `DailyPlanTag` in types.ts exactly. Tasks reference tags by id (`tagIds`),
// which becomes a `daily_task_tag` join table in the SQLite step.

export const dailyTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string() // hex
})

export type DailyTag = z.infer<typeof dailyTagSchema>

export function makeDailyTag(p: Partial<DailyTag> & Pick<DailyTag, 'name' | 'color'>): DailyTag {
  return dailyTagSchema.parse({ id: crypto.randomUUID(), ...p })
}
