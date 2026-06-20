import './meeting-notes.css'
import { UITexts } from '@texts'
import type { MeetingNote } from '@ui/types/types'
import {
  ARCHIVE_SVG,
  formatDate,
  sortedNotes,
  groupByProject,
  projectFor,
  setActiveRerender,
  isArchivedOpen,
  makeNewMeetingClick,
  makeArchivedToggle,
  makeRemindClick,
  makeArchiveClick,
  makeDeleteClick,
  makeCardClick
} from './meeting-notes.state'

export { openNewMeeting, openMeetingNote } from './meeting-notes.state'

export function renderMeetingNotes(host: HTMLElement): void {
  host.innerHTML = ''
  host.classList.add('meeting-notes')

  const render = (): void => renderMeetingNotes(host)
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
      list.appendChild(renderCard(note, render, false))
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
        list.appendChild(renderCard(note, render, true))
      }
    }
  }
}

function renderCard(note: MeetingNote, rerender: () => void, showProject: boolean): HTMLElement {
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
