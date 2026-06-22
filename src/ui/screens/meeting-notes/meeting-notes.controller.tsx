import { UITexts } from '@texts'
import { createMeetingNoteCard } from './components/meeting-note-card'
import {
  sortedNotes,
  groupByProject,
  setActiveRerender,
  isArchivedOpen,
  makeNewMeetingClick,
  makeArchivedToggle
} from './meeting-notes.state'

// Owns the meeting-notes panel render: header, grouped active cards and the
// collapsible archived section. Re-render is recursive (a fresh controller per
// pass), so `render` is bound as the active rerender callback.
export class MeetingNotesController {
  private readonly host: HTMLElement

  constructor(host: HTMLElement) {
    this.host = host
  }

  render = (): void => {
    const host = this.host
    host.innerHTML = ''
    host.classList.add('meeting-notes')

    const render = this.render
    setActiveRerender(render)

    const header = (
      <div class="meeting-notes-header">
        <div class="meeting-notes-title">{UITexts.MeetingNotes.title}</div>
        <button class="daily-plan-primary-btn" onClick={makeNewMeetingClick(render)}>
          {UITexts.MeetingNotes.newMeeting}
        </button>
      </div>
    ) as HTMLDivElement
    host.appendChild(header)

    const list = (<div class="meeting-notes-list" />) as HTMLDivElement
    host.appendChild(list)

    const notes = sortedNotes()
    if (!notes.length) {
      const empty = (<div class="meeting-notes-empty">{UITexts.MeetingNotes.empty}</div>) as HTMLDivElement
      list.appendChild(empty)
      return
    }

    const active = notes.filter((n) => !n.archived)
    const archived = notes.filter((n) => n.archived)

    for (const group of groupByProject(active)) {
      const head = (<div class="meeting-note-group-header">{group.name}</div>) as HTMLDivElement
      list.appendChild(head)
      for (const note of group.notes) {
        list.appendChild(createMeetingNoteCard({ note, rerender: render, showProject: false }))
      }
    }

    if (archived.length) {
      const toggle = (
        <button class="meeting-note-archived-toggle" onClick={makeArchivedToggle(render)}>
          {`${isArchivedOpen() ? '▾' : '▸'} ${UITexts.MeetingNotes.archived(archived.length)}`}
        </button>
      ) as HTMLButtonElement
      list.appendChild(toggle)
      if (isArchivedOpen()) {
        for (const note of archived) {
          list.appendChild(createMeetingNoteCard({ note, rerender: render, showProject: true }))
        }
      }
    }
  }
}
