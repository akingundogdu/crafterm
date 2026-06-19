import './meeting-notes.css'
import type { MeetingNote } from '../../types'
import { state } from '../../state'
import { meetingNoteRepo } from '@services/storage/repositories'
import { promptConfirm } from '../../dialog'
import { findProjectById } from '../../catalog'
import { showRemindModal } from '../reminders/reminders'
import { showMeetingForm } from './components/meeting-form'

const ARCHIVE_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M9 13h6"/></svg>'

const NO_PROJECT_GROUP = 'No project'

interface NoteGroup {
  name: string
  notes: MeetingNote[]
}

function formatDate(s: string): string {
  const [y, m, d] = s.split('-').map((n) => parseInt(n, 10))
  if (!y) return s
  const date = new Date(y, (m || 1) - 1, d || 1)
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

// Notes sorted newest-first (by date, then creation time).
function sortedNotes(): MeetingNote[] {
  return meetingNoteRepo.getAll().slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
}

// Group notes by their project name; notes without a project fall into a
// trailing "No project" group. Project groups are sorted alphabetically and
// each group keeps the newest-first order of the incoming list.
function groupByProject(notes: MeetingNote[]): NoteGroup[] {
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

let activeRerender: (() => void) | null = null
let archivedOpen = false

export function renderMeetingNotes(host: HTMLElement): void {
  host.innerHTML = ''
  host.classList.add('meeting-notes')

  const render = (): void => renderMeetingNotes(host)
  activeRerender = render

  const header = (
    <div class="meeting-notes-header">
      <div class="meeting-notes-title">Meeting Notes</div>
      <button class="daily-plan-primary-btn" onClick={() => showMeetingForm(null, render)}>
        + New meeting
      </button>
    </div>
  ) as HTMLDivElement
  host.appendChild(header)

  const list = (<div class="meeting-notes-list" />) as HTMLDivElement
  host.appendChild(list)

  const notes = sortedNotes()
  if (!notes.length) {
    const empty = (<div class="meeting-notes-empty">No meeting notes yet.</div>) as HTMLDivElement
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
      <button
        class="meeting-note-archived-toggle"
        onClick={() => {
          archivedOpen = !archivedOpen
          render()
        }}
      >
        {`${archivedOpen ? '▾' : '▸'} Archived (${archived.length})`}
      </button>
    ) as HTMLButtonElement
    list.appendChild(toggle)
    if (archivedOpen) {
      for (const note of archived) {
        list.appendChild(renderCard(note, render, true))
      }
    }
  }
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

function renderCard(note: MeetingNote, rerender: () => void, showProject: boolean): HTMLElement {
  const remind = (
    <button
      class="daily-plan-card-icon"
      title="Remind me"
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        const subject = note.title || 'meeting note'
        showRemindModal(subject, subject, { kind: 'meetingNote', noteId: note.id })
      }}
    >
      ⏰
    </button>
  ) as HTMLButtonElement
  const arch = (
    <button
      class="daily-plan-card-icon"
      title={note.archived ? 'Unarchive' : 'Archive'}
      innerHTML={ARCHIVE_SVG}
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        note.archived = !note.archived
        note.updatedAt = Date.now()
        if (note.archived) archivedOpen = true
        meetingNoteRepo.upsert(note)
        rerender()
      }}
    />
  ) as HTMLButtonElement
  const del = (
    <button
      class="daily-plan-card-icon"
      title="Delete"
      onClick={async (e: MouseEvent) => {
        e.stopPropagation()
        const ok = await promptConfirm({
          title: 'Delete meeting note',
          message: `Delete "${note.title || 'untitled'}"?`,
          confirmText: 'Delete'
        })
        if (!ok) return
        meetingNoteRepo.remove(note.id)
        rerender()
      }}
    >
      ×
    </button>
  ) as HTMLButtonElement

  const card = (
    <div class="meeting-note-card">
      <div class="meeting-note-top">
        <span class="meeting-note-date">{formatDate(note.date)}</span>
        <div class="meeting-note-title">{note.title || '(untitled)'}</div>
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

  const project = showProject && note.projectId ? findProjectById(state.tree, note.projectId) : null
  if (project) {
    const proj = (<span class="meeting-note-project">{project.name}</span>) as HTMLSpanElement
    card.appendChild(proj)
  }

  if (note.notes.trim()) {
    const body = (<div class="meeting-note-snippet">{note.notes.trim()}</div>) as HTMLDivElement
    card.appendChild(body)
  }

  card.addEventListener('click', () => showMeetingForm(note, rerender))
  return card
}
