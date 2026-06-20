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
