import './meeting-notes.css'
import { MeetingNotesController } from './meeting-notes.controller'

export { openNewMeeting, openMeetingNote } from './meeting-notes.state'

export function renderMeetingNotes(host: HTMLElement): void {
  new MeetingNotesController(host).render()
}
