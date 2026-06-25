import { Component } from '@geajs/core'
import type { MeetingNote } from '@ui/types/types'
import { UITexts } from '@texts'
import { meetingNoteRepo } from '@repositories'
import { promptConfirm } from '@ui/components/dialog/dialog'
import { showRemindModal } from '@ui/screens/reminders/reminders'
import { showMeetingForm } from '@ui/screens/meeting-notes/components/meeting-form'
import { ARCHIVE_SVG, formatDate, projectFor } from '@ui/screens/meeting-notes/meeting-notes.state'
import store from '../meeting-notes.store'

// gea port of the meeting-note card: date / title / remind·archive·delete, plus
// optional attendees, project and a notes snippet. The archive icon SVG is set
// imperatively in onAfterRender (no innerHTML JSX prop).
export default class MeetingNoteCard extends Component {
  declare props: { note: MeetingNote; showProject: boolean }
  archBtn: HTMLElement | null = null

  private raw = (): MeetingNote => meetingNoteRepo.get(this.props.note.id) ?? this.props.note

  onAfterRender(): void {
    if (this.archBtn) this.archBtn.innerHTML = ARCHIVE_SVG
  }

  private onDelete = async (e: MouseEvent): Promise<void> => {
    e.stopPropagation()
    const note = this.props.note
    const ok = await promptConfirm({
      title: UITexts.MeetingNotes.card.deleteTitle,
      message: UITexts.MeetingNotes.card.deleteConfirm(note.title || UITexts.MeetingNotes.card.deleteNameFallback),
      confirmText: UITexts.MeetingNotes.card.deleteConfirmText
    })
    if (ok) store.remove(note.id)
  }

  template({ note, showProject }: this['props']) {
    const project = projectFor(note, showProject)
    return (
      <div class="meeting-note-card" onClick={() => showMeetingForm(this.raw(), () => store.reload())}>
        <div class="meeting-note-top">
          <span class="meeting-note-date">{formatDate(note.date)}</span>
          <div class="meeting-note-title">{note.title || UITexts.MeetingNotes.untitled}</div>
          <div class="meeting-note-actions">
            <button
              class="daily-plan-card-icon"
              title={UITexts.MeetingNotes.card.remind}
              onClick={(e: MouseEvent) => {
                e.stopPropagation()
                const subject = note.title || UITexts.MeetingNotes.card.remindSubjectFallback
                showRemindModal(subject, subject, { kind: 'meetingNote', noteId: note.id })
              }}
            >
              ⏰
            </button>
            <button
              class="daily-plan-card-icon"
              ref={this.archBtn}
              title={note.archived ? UITexts.MeetingNotes.card.unarchive : UITexts.MeetingNotes.card.archive}
              onClick={(e: MouseEvent) => {
                e.stopPropagation()
                store.archive(note.id)
              }}
            />
            <button class="daily-plan-card-icon" title={UITexts.MeetingNotes.card.delete} onClick={this.onDelete}>
              ×
            </button>
          </div>
        </div>
        {note.attendees.length > 0 && <div class="meeting-note-attendees">{note.attendees.join(', ')}</div>}
        {project && <span class="meeting-note-project">{project.name}</span>}
        {note.notes.trim() && <div class="meeting-note-snippet">{note.notes.trim()}</div>}
      </div>
    )
  }
}
