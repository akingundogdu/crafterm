import type { MeetingNote } from '@ui/types/types'

// Meeting notes collection — extracted from `settings` (was settings.meetingNotes).
// Persisted into the single crafterm-state.json; meetingNoteRepo operates here.
export const meetingNotes: MeetingNote[] = []

export function setMeetingNotes(next: MeetingNote[]): void {
  meetingNotes.length = 0
  meetingNotes.push(...next)
}
