import { UITexts } from '@texts'
import type { MeetingNote } from '@ui/types/types'
import { state } from '@ui/state/state'
import { meetingNoteRepo } from '@repositories'
import { promptConfirm } from '@ui/components/dialog/dialog'
import { findProjectById } from '@ui/catalog/catalog'
import { showRemindModal } from '../reminders/reminders'
import { showMeetingForm } from './components/meeting-form'
import type { NoteGroup } from './meeting-notes.types'

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
  return () => showMeetingForm(null, render)
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
  return () => showMeetingForm(note, rerender)
}

// Cmd+N entry point while the Meeting Notes view is shown.
export function openNewMeeting(): void {
  showMeetingForm(null, () => activeRerender?.())
}

// Deep-link: open the edit form for a specific note (e.g. from a reminder card).
export function openMeetingNote(noteId: string): void {
  const note = meetingNoteRepo.get(noteId)
  if (!note) return
  showMeetingForm(note, () => activeRerender?.())
}
