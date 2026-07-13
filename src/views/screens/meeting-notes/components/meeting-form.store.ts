import { Store } from '@geajs/core'
import { meetingNoteRepo } from '@repositories'
import { UITexts } from '@texts'
import type { MeetingNote } from '@views/types/types'
import { uid } from '@views/lib/uid'

// Today as YYYY-MM-DD (local).
function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Reactive state + logic for the gea meeting-note add/edit form (merges the legacy
// meeting-form.state helpers + imperative wiring). Singleton reset on each open.
// The date string is the source of truth; the embedded DateField widget edits it
// via its change event. Self-contained — no @ui (§2.7).
class MeetingFormStore extends Store {
  title = ''
  date = todayKey()
  attendees = ''
  projectId = ''
  notes = ''
  existing: MeetingNote | null = null

  private onSaved: () => void = () => {}
  private closeFn: () => void = () => {}

  open(existing: MeetingNote | null, onSaved: () => void, close: () => void): void {
    this.existing = existing
    this.title = existing?.title ?? ''
    this.date = existing?.date ?? todayKey()
    this.attendees = (existing?.attendees ?? []).join(', ')
    this.projectId = existing?.projectId ?? ''
    this.notes = existing?.notes ?? ''
    this.onSaved = onSaved
    this.closeFn = close
  }

  get titleText(): string {
    return this.existing ? UITexts.MeetingNotes.form.editTitle : UITexts.MeetingNotes.form.newTitle
  }

  setDate(v: string): void {
    this.date = v
  }

  close(): void {
    this.closeFn()
  }

  // Validates (title or notes required), upserts, then closes + notifies. Builds a
  // fresh object via spread so a reactive proxy is only READ, never assigned (§5.3).
  save(): void {
    const title = this.title.trim()
    if (!title && !this.notes.trim()) return
    const attendees = this.attendees
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
    const now = Date.now()
    const base: MeetingNote = this.existing
      ? { ...this.existing }
      : { id: uid('mtg'), title: '', date: this.date, attendees: [], notes: '', createdAt: now, updatedAt: now }
    meetingNoteRepo.upsert({
      ...base,
      title,
      date: this.date || todayKey(),
      attendees,
      notes: this.notes,
      projectId: this.projectId || undefined,
      updatedAt: now
    })
    this.close()
    this.onSaved()
  }
}

export default new MeetingFormStore()
