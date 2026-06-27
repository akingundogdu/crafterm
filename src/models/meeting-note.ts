import { z } from 'zod'

// Meeting note — mirrors `MeetingNote` in types.ts exactly (HR-1).

export const meetingNoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string(), // YYYY-MM-DD
  attendees: z.array(z.string()),
  notes: z.string(),
  projectId: z.string().optional(),
  archived: z.boolean().optional(),
  createdAt: z.number(),
  updatedAt: z.number()
})

export type MeetingNote = z.infer<typeof meetingNoteSchema>

export function makeMeetingNote(
  p: Partial<MeetingNote> & Pick<MeetingNote, 'title' | 'date'>
): MeetingNote {
  const now = Date.now()
  return meetingNoteSchema.parse({
    id: crypto.randomUUID(),
    attendees: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
    ...p
  })
}

// Live collection (structured meeting notes). Persisted into the single
// crafterm-state.json; meetingNoteRepo operates on this array (stable reference).
export const meetingNotes: MeetingNote[] = []

export function setMeetingNotes(next: MeetingNote[]): void {
  meetingNotes.length = 0
  meetingNotes.push(...next)
}
