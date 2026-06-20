import type { MeetingNote } from '@ui/types/types'
import type { DateField } from '@ui/components'
import { uid } from '@ui/state/state'
import { meetingNoteRepo } from '@repositories'

export function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// The live form controls the handlers operate on.
export interface MeetingFormControls {
  titleInput: HTMLInputElement
  dateInput: DateField
  attInput: HTMLInputElement
  projSel: HTMLSelectElement
  notesInput: HTMLTextAreaElement
}

// Validates + upserts (in place when editing). Returns false (and refocuses the
// title) when both title and notes are blank.
export function commitMeeting(c: MeetingFormControls, existing: MeetingNote | null): boolean {
  const title = c.titleInput.value.trim()
  const notes = c.notesInput.value
  if (!title && !notes.trim()) {
    c.titleInput.focus()
    return false
  }
  const attendees = c.attInput.value
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)
  const now = Date.now()
  if (existing) {
    existing.title = title
    existing.date = c.dateInput.value || todayKey()
    existing.attendees = attendees
    existing.notes = notes
    existing.projectId = c.projSel.value || undefined
    existing.updatedAt = now
    meetingNoteRepo.upsert(existing)
  } else {
    meetingNoteRepo.upsert({
      id: uid('mtg'),
      title,
      date: c.dateInput.value || todayKey(),
      attendees,
      notes,
      projectId: c.projSel.value || undefined,
      createdAt: now,
      updatedAt: now
    })
  }
  return true
}

// Confirm handler: commit, then close + notify on success.
export function makeSaveMeeting(
  c: MeetingFormControls,
  existing: MeetingNote | null,
  close: () => void,
  onSaved: () => void
): () => void {
  return () => {
    if (!commitMeeting(c, existing)) return
    close()
    onSaved()
  }
}

// keydown handler: Escape closes the form (and always stops propagation).
export function makeEscapeClose(close: () => void): (e: KeyboardEvent) => void {
  return (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  }
}
