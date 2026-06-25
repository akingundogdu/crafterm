import MeetingNotes from '@views/screens/meeting-notes/meeting-notes'

// Meeting Notes panel — migrated to gea (src/views/screens/meeting-notes). This
// legacy entry mounts the gea component into the Notebook sub-tab host. The
// Cmd+N / deep-link helpers stay re-exported from the legacy state module.
export { openNewMeeting, openMeetingNote } from './meeting-notes.state'

export function renderMeetingNotes(host: HTMLElement): void {
  host.replaceChildren()
  host.classList.add('meeting-notes')
  new MeetingNotes().render(host)
}
