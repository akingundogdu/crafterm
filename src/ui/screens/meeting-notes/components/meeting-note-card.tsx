import { MeetingNoteCardController, type MeetingNoteCardOptions } from './meeting-note-card.controller'

export type { MeetingNoteCardOptions } from './meeting-note-card.controller'

export function createMeetingNoteCard(opts: MeetingNoteCardOptions): HTMLElement {
  return new MeetingNoteCardController(opts).render()
}
