import { UITexts } from '@texts'
import type { MeetingNote } from '@ui/types/types'
import {
  ARCHIVE_SVG,
  formatDate,
  projectFor,
  makeRemindClick,
  makeArchiveClick,
  makeDeleteClick,
  makeCardClick
} from '../meeting-notes.state'

// A single meeting-note card: date / title / remind / archive / delete actions,
// plus optional attendees, project, and a notes snippet.

export interface MeetingNoteCardOptions {
  note: MeetingNote
  rerender: () => void
  showProject: boolean
}

export function createMeetingNoteCard(opts: MeetingNoteCardOptions): HTMLElement {
  const { note, rerender, showProject } = opts

  const remind = (
    <button class="daily-plan-card-icon" title={UITexts.MeetingNotes.card.remind} onClick={makeRemindClick(note)}>
      ⏰
    </button>
  ) as HTMLButtonElement
  const arch = (
    <button
      class="daily-plan-card-icon"
      title={note.archived ? UITexts.MeetingNotes.card.unarchive : UITexts.MeetingNotes.card.archive}
      innerHTML={ARCHIVE_SVG}
      onClick={makeArchiveClick(note, rerender)}
    />
  ) as HTMLButtonElement
  const del = (
    <button class="daily-plan-card-icon" title={UITexts.MeetingNotes.card.delete} onClick={makeDeleteClick(note, rerender)}>
      ×
    </button>
  ) as HTMLButtonElement

  const card = (
    <div class="meeting-note-card">
      <div class="meeting-note-top">
        <span class="meeting-note-date">{formatDate(note.date)}</span>
        <div class="meeting-note-title">{note.title || UITexts.MeetingNotes.untitled}</div>
        <div class="meeting-note-actions">
          {remind}
          {arch}
          {del}
        </div>
      </div>
    </div>
  ) as HTMLDivElement

  if (note.attendees.length) {
    const att = (<div class="meeting-note-attendees">{note.attendees.join(', ')}</div>) as HTMLDivElement
    card.appendChild(att)
  }

  const project = projectFor(note, showProject)
  if (project) {
    const proj = (<span class="meeting-note-project">{project.name}</span>) as HTMLSpanElement
    card.appendChild(proj)
  }

  if (note.notes.trim()) {
    const body = (<div class="meeting-note-snippet">{note.notes.trim()}</div>) as HTMLDivElement
    card.appendChild(body)
  }

  card.addEventListener('click', makeCardClick(note, rerender))
  return card
}
