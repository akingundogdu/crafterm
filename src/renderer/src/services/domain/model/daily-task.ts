import { z } from 'zod'

// Daily-plan task — table-oriented domain model (§3.12). The Zod schema is the
// single source of truth; the TS type is derived from it (kills the live vs
// Saved* duality). Shape mirrors the current `DailyPlanTask` in types.ts exactly
// (HR-1: no behavior change), modeled as a flat row ready for a SQLite table.

export const dailyTaskStatus = z.enum(['backlog', 'todo', 'wip', 'review', 'test', 'done'])
export const dailyTaskPriority = z.enum(['low', 'medium', 'high'])

export const dailyTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  date: z.string(), // YYYY-MM-DD
  dueDate: z.string().optional(),
  status: dailyTaskStatus,
  priority: dailyTaskPriority,
  tagIds: z.array(z.string()), // FK -> daily_tag.id (M:N table later)
  order: z.number(),
  projectId: z.string().optional(), // FK -> project.id
  issueKey: z.string().optional(),
  worktreeSlug: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number()
})

export type DailyTask = z.infer<typeof dailyTaskSchema>
export type DailyTaskStatus = z.infer<typeof dailyTaskStatus>
export type DailyTaskPriority = z.infer<typeof dailyTaskPriority>

export function makeDailyTask(
  p: Partial<DailyTask> & Pick<DailyTask, 'title' | 'date'>
): DailyTask {
  const now = Date.now()
  return dailyTaskSchema.parse({
    id: crypto.randomUUID(),
    status: 'backlog',
    priority: 'medium',
    tagIds: [],
    order: 0,
    createdAt: now,
    updatedAt: now,
    ...p
  })
}
