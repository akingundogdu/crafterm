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

  const header = document.createElement('div')
  header.className = 'meeting-notes-header'
  const title = document.createElement('div')
  title.className = 'meeting-notes-title'
  title.textContent = 'Meeting Notes'
  const newBtn = document.createElement('button')
  newBtn.className = 'daily-plan-primary-btn'
  newBtn.textContent = '+ New meeting'
  newBtn.addEventListener('click', () => showMeetingForm(null, render))
  header.append(title, newBtn)
  host.appendChild(header)

  const list = document.createElement('div')
  list.className = 'meeting-notes-list'
  host.appendChild(list)

  const notes = sortedNotes()
  if (!notes.length) {
    const empty = document.createElement('div')
    empty.className = 'meeting-notes-empty'
    empty.textContent = 'No meeting notes yet.'
    list.appendChild(empty)
    return
  }

  const active = notes.filter((n) => !n.archived)
  const archived = notes.filter((n) => n.archived)

  for (const group of groupByProject(active)) {
    const head = document.createElement('div')
    head.className = 'meeting-note-group-header'
    head.textContent = group.name
    list.appendChild(head)
    for (const note of group.notes) {
      list.appendChild(renderCard(note, render, false))
    }
  }

  if (archived.length) {
    const toggle = document.createElement('button')
    toggle.className = 'meeting-note-archived-toggle'
    toggle.textContent = `${archivedOpen ? '▾' : '▸'} Archived (${archived.length})`
    toggle.addEventListener('click', () => {
      archivedOpen = !archivedOpen
      render()
    })
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
  const card = document.createElement('div')
  card.className = 'meeting-note-card'

  const top = document.createElement('div')
  top.className = 'meeting-note-top'
  const date = document.createElement('span')
  date.className = 'meeting-note-date'
  date.textContent = formatDate(note.date)
  const title = document.createElement('div')
  title.className = 'meeting-note-title'
  title.textContent = note.title || '(untitled)'

  const actions = document.createElement('div')
  actions.className = 'meeting-note-actions'
  const remind = document.createElement('button')
  remind.className = 'daily-plan-card-icon'
  remind.title = 'Remind me'
  remind.textContent = '⏰'
  remind.addEventListener('click', (e) => {
    e.stopPropagation()
    const subject = note.title || 'meeting note'
    showRemindModal(subject, subject, { kind: 'meetingNote', noteId: note.id })
  })
  const arch = document.createElement('button')
  arch.className = 'daily-plan-card-icon'
  arch.title = note.archived ? 'Unarchive' : 'Archive'
  arch.innerHTML = ARCHIVE_SVG
  arch.addEventListener('click', (e) => {
    e.stopPropagation()
    note.archived = !note.archived
    note.updatedAt = Date.now()
    if (note.archived) archivedOpen = true
    meetingNoteRepo.upsert(note)
    rerender()
  })
  const del = document.createElement('button')
  del.className = 'daily-plan-card-icon'
  del.title = 'Delete'
  del.textContent = '×'
  del.addEventListener('click', async (e) => {
    e.stopPropagation()
    const ok = await promptConfirm({
      title: 'Delete meeting note',
      message: `Delete "${note.title || 'untitled'}"?`,
      confirmText: 'Delete'
    })
    if (!ok) return
    meetingNoteRepo.remove(note.id)
    rerender()
  })
  actions.append(remind, arch, del)

  top.append(date, title, actions)
  card.appendChild(top)

  if (note.attendees.length) {
    const att = document.createElement('div')
    att.className = 'meeting-note-attendees'
    att.textContent = note.attendees.join(', ')
    card.appendChild(att)
  }

  const project = showProject && note.projectId ? findProjectById(state.tree, note.projectId) : null
  if (project) {
    const proj = document.createElement('span')
    proj.className = 'meeting-note-project'
    proj.textContent = project.name
    card.appendChild(proj)
  }

  if (note.notes.trim()) {
    const body = document.createElement('div')
    body.className = 'meeting-note-snippet'
    body.textContent = note.notes.trim()
    card.appendChild(body)
  }

  card.addEventListener('click', () => showMeetingForm(note, rerender))
  return card
}
