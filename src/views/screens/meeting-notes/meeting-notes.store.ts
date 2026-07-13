import { Store } from '@geajs/core'
import { UITexts } from '@texts'
import type { MeetingNote } from '@views/types/types'
import { state } from '@views/state/spine'
import { meetingNoteRepo } from '@repositories'
import { promptConfirm } from '@views/components/dialog/confirm'
import { findProjectById } from '@views/catalog/catalog'
import { showRemindModal } from '@views/screens/reminders/components/remind-modal'
import { openMeetingForm } from './components/meeting-form.open'

// Pure logic + helpers for the meeting-notes panel (plain-DOM-free port of the
// legacy @ui meeting-notes.state). Self-contained — no @ui (§2.7). The gea panel
// (meeting-notes.tsx / meeting-note-card.tsx) reuses these.

export interface NoteGroup {
  name: string
  notes: MeetingNote[]
}

export const ARCHIVE_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M9 13h6"/></svg>'

const NO_PROJECT_GROUP = UITexts.MeetingNotes.noProjectGroup

export function formatDate(s: string): string {
  const [y, m, d] = s.split('-').map((n) => parseInt(n, 10))
  if (!y) return s
  const date = new Date(y, (m || 1) - 1, d || 1)
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

// Notes sorted newest-first (by date, then creation time).
export function sortedNotes(): MeetingNote[] {
  return meetingNoteRepo.getAll().slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
}

// Group notes by their project name; notes without a project fall into a
// trailing "No project" group. Project groups are sorted alphabetically and
// each group keeps the newest-first order of the incoming list.
export function groupByProject(notes: MeetingNote[]): NoteGroup[] {
  const byProject = new Map<string, MeetingNote[]>()
  const orphans: MeetingNote[] = []
  for (const note of notes) {
    const project = note.projectId ? findProjectById(state.tree, note.projectId) : null
    if (project) {
      const arr = byProject.get(project.name)
      if (arr) arr.push(note)
      else byProject.set(project.name, [note])
    } else {
      orphans.push(note)
    }
  }
  const groups: NoteGroup[] = [...byProject.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, ns]) => ({ name, notes: ns }))
  if (orphans.length) groups.push({ name: NO_PROJECT_GROUP, notes: orphans })
  return groups
}

// The project node to label a card with, or null when not shown / unresolved.
export function projectFor(note: MeetingNote, showProject: boolean): { name: string } | null {
  return showProject && note.projectId ? findProjectById(state.tree, note.projectId) : null
}

let activeRerender: (() => void) | null = null
let archivedOpen = false

export function setActiveRerender(fn: () => void): void {
  activeRerender = fn
}

export function isArchivedOpen(): boolean {
  return archivedOpen
}

export function makeNewMeetingClick(render: () => void): () => void {
  return () => openMeetingForm(null, render)
}

export function makeArchivedToggle(render: () => void): () => void {
  return () => {
    archivedOpen = !archivedOpen
    render()
  }
}

export function makeRemindClick(note: MeetingNote): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    const subject = note.title || UITexts.MeetingNotes.card.remindSubjectFallback
    showRemindModal(subject, subject, { kind: 'meetingNote', noteId: note.id })
  }
}

export function makeArchiveClick(note: MeetingNote, rerender: () => void): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    note.archived = !note.archived
    note.updatedAt = Date.now()
    if (note.archived) archivedOpen = true
    meetingNoteRepo.upsert(note)
    rerender()
  }
}

export function makeDeleteClick(note: MeetingNote, rerender: () => void): (e: MouseEvent) => Promise<void> {
  return async (e) => {
    e.stopPropagation()
    const ok = await promptConfirm({
      title: UITexts.MeetingNotes.card.deleteTitle,
      message: UITexts.MeetingNotes.card.deleteConfirm(note.title || UITexts.MeetingNotes.card.deleteNameFallback),
      confirmText: UITexts.MeetingNotes.card.deleteConfirmText
    })
    if (!ok) return
    meetingNoteRepo.remove(note.id)
    rerender()
  }
}

export function makeCardClick(note: MeetingNote, rerender: () => void): () => void {
  return () => openMeetingForm(note, rerender)
}

// Cmd+N entry point while the Meeting Notes view is shown.
export function openNewMeeting(): void {
  openMeetingForm(null, () => activeRerender?.())
}

// Deep-link: open the edit form for a specific note (e.g. from a reminder card).
export function openMeetingNote(noteId: string): void {
  const note = meetingNoteRepo.get(noteId)
  if (!note) return
  openMeetingForm(note, () => activeRerender?.())
}

// Reactive state for the gea Meeting Notes panel. meetingNoteRepo stays the
// persisted source of truth; this store mirrors it into a reactive array.
class MeetingNotesStore extends Store {
  items: MeetingNote[] = []
  archivedOpen = false

  reload(): void {
    this.items = [...meetingNoteRepo.getAll()]
  }

  toggleArchived(): void {
    this.archivedOpen = !this.archivedOpen
  }

  // Archive/unarchive operates on the RAW repo note (it mutates fields).
  archive(id: string): void {
    const note = meetingNoteRepo.get(id)
    if (!note) return
    note.archived = !note.archived
    note.updatedAt = Date.now()
    if (note.archived) this.archivedOpen = true
    meetingNoteRepo.upsert(note)
    this.reload()
  }

  remove(id: string): void {
    meetingNoteRepo.remove(id)
    this.reload()
  }
}

export default new MeetingNotesStore()
