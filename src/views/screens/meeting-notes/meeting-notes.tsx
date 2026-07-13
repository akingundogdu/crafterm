import './meeting-notes.css'
import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import { groupByProject, setActiveRerender } from '@views/screens/meeting-notes/meeting-notes.store'
import { openMeetingForm } from './components/meeting-form.open'
import MeetingNoteCard from './components/meeting-note-card'
import store from './meeting-notes.store'

// gea Meeting Notes panel: header + active cards grouped by project + a
// collapsible archived section, reactive off the store. Mounted by the legacy
// renderMeetingNotes into the Notebook sub-tab host. The archived card list is
// always mounted (visibility toggled via CSS) per plan §5.2.
export default class MeetingNotes extends Component {
  created(): void {
    store.reload()
    // Lets the Cmd+N entry point (openNewMeeting → activeRerender) refresh us.
    setActiveRerender(() => store.reload())
  }

  template() {
    const notes = [...store.items].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    const active = notes.filter((n) => !n.archived)
    const archived = notes.filter((n) => n.archived)
    const groups = groupByProject(active)
    return (
      <div class="meeting-notes-root" style={{ display: 'contents' }}>
        <div class="meeting-notes-header">
          <div class="meeting-notes-title">{UITexts.MeetingNotes.title}</div>
          <button class="daily-plan-primary-btn" onClick={() => openMeetingForm(null, () => store.reload())}>
            {UITexts.MeetingNotes.newMeeting}
          </button>
        </div>
        <div class="meeting-notes-list">
          {groups.map((g) => (
            <div key={g.name} class="meeting-note-group" style={{ display: 'contents' }}>
              <div class="meeting-note-group-header">{g.name}</div>
              {g.notes.map((n) => (
                <MeetingNoteCard key={n.id} note={n} showProject={false} />
              ))}
            </div>
          ))}
          {archived.length > 0 && (
            <button class="meeting-note-archived-toggle" onClick={() => store.toggleArchived()}>
              {`${store.archivedOpen ? '▾' : '▸'} ${UITexts.MeetingNotes.archived(archived.length)}`}
            </button>
          )}
          <div
            class="meeting-note-archived-cards"
            style={store.archivedOpen && archived.length > 0 ? { display: 'contents' } : { display: 'none' }}
          >
            {archived.map((n) => (
              <MeetingNoteCard key={n.id} note={n} showProject={true} />
            ))}
          </div>
          {notes.length === 0 && <div class="meeting-notes-empty">{UITexts.MeetingNotes.empty}</div>}
        </div>
      </div>
    )
  }
}

// Mount entry (was the legacy @ui renderMeetingNotes): mounts the gea panel into
// the Notebook sub-tab host. Kept here so the @views tree owns it (no @ui).
export function renderMeetingNotes(host: HTMLElement): void {
  host.replaceChildren()
  host.classList.add('meeting-notes')
  new MeetingNotes().render(host)
}
