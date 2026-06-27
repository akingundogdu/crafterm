import { z } from 'zod'

// Reminder — mirrors `Reminder` + `ReminderPayload` in types.ts exactly (HR-1).
// The payload is a discriminated union on `kind`; each variant points at the
// thing the reminder opens (becomes a small typed column set in SQLite).

export const reminderPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('bookmark'), bookmarkId: z.string() }),
  z.object({ kind: z.literal('pane'), paneId: z.string() }),
  z.object({ kind: z.literal('notebook'), path: z.string() }),
  z.object({ kind: z.literal('dailyTask'), taskId: z.string() }),
  z.object({ kind: z.literal('plan'), path: z.string() }),
  z.object({ kind: z.literal('meetingNote'), noteId: z.string() })
])

export const reminderRepeat = z.enum(['none', 'daily', 'weekly', 'biweekly', 'monthly', 'interval'])

export const reminderSchema = z.object({
  id: z.string(),
  text: z.string(),
  time: z.number(), // next fire timestamp (ms)
  repeat: reminderRepeat,
  intervalMin: z.number().optional(),
  enabled: z.boolean(),
  firedAt: z.number().optional(),
  payload: reminderPayloadSchema.optional(),
  category: z.enum(['normal', 'bookmark', 'link', 'dailyTask']).optional()
})

export type ReminderPayload = z.infer<typeof reminderPayloadSchema>
export type Reminder = z.infer<typeof reminderSchema>

export function makeReminder(
  p: Partial<Reminder> & Pick<Reminder, 'text' | 'time'>
): Reminder {
  return reminderSchema.parse({ id: crypto.randomUUID(), repeat: 'none', enabled: true, ...p })
}

// Live collection (scheduled reminders). Persisted into the single
// crafterm-state.json; reminderRepo operates on this array (stable reference).
export const reminders: Reminder[] = []

export function setReminders(next: Reminder[]): void {
  reminders.length = 0
  reminders.push(...next)
}
