import { z } from 'zod'

// Time entry — mirrors `TimeEntry` in types.ts exactly (HR-1). One logged work
// interval, attributed to a project (and optionally a feature).

export const timeEntrySchema = z.object({
  id: z.string(),
  projectPath: z.string(),
  featureId: z.string().optional(),
  start: z.number(), // ms epoch
  end: z.number(), // ms epoch
  source: z.enum(['manual', 'pomodoro', 'auto'])
})

export type TimeEntry = z.infer<typeof timeEntrySchema>

export function makeTimeEntry(
  p: Partial<TimeEntry> & Pick<TimeEntry, 'projectPath' | 'start' | 'end' | 'source'>
): TimeEntry {
  return timeEntrySchema.parse({ id: crypto.randomUUID(), ...p })
}

// Live collection (logged work intervals). Persisted into the single
// crafterm-state.json; timeEntryRepo operates on this array (stable reference).
export const timeEntries: TimeEntry[] = []

export function setTimeEntries(next: TimeEntry[]): void {
  timeEntries.length = 0
  timeEntries.push(...next)
}
