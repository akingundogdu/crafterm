import type { MeetingNote } from './types'
import { settings, state, saveSoon, uid } from './state'
import { makeCloseButton, promptConfirm } from './dialog'
import { flattenProjects, findProjectById } from './catalog'

function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDate(s: string): string {
  const [y, m, d] = s.split('-').map((n) => parseInt(n, 10))
  if (!y) return s
  const date = new Date(y, (m || 1) - 1, d || 1)
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

// Notes sorted newest-first (by date, then creation time).
function sortedNotes(): MeetingNote[] {
  return settings.meetingNotes.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
}

let activeRerender: (() => void) | null = null

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

  for (const note of notes) {
    list.appendChild(renderCard(note, render))
  }
}

// Cmd+N entry point while the Meeting Notes view is shown.
export function openNewMeeting(): void {
  showMeetingForm(null, () => activeRerender?.())
}

function renderCard(note: MeetingNote, rerender: () => void): HTMLElement {
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
    const i = settings.meetingNotes.findIndex((n) => n.id === note.id)
    if (i >= 0) settings.meetingNotes.splice(i, 1)
    saveSoon()
    rerender()
  })
  actions.appendChild(del)

  top.append(date, title, actions)
  card.appendChild(top)

  if (note.attendees.length) {
    const att = document.createElement('div')
    att.className = 'meeting-note-attendees'
    att.textContent = note.attendees.join(', ')
    card.appendChild(att)
  }

  const project = note.projectId ? findProjectById(state.tree, note.projectId) : null
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

function showMeetingForm(existing: MeetingNote | null, onSaved: () => void): void {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay daily-plan-form-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal prompt-modal daily-plan-form'
  overlay.appendChild(modal)

  const close = (): void => {
    document.removeEventListener('keydown', onKey, true)
    overlay.remove()
  }
  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKey, true)
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  modal.appendChild(makeCloseButton(close))

  const h = document.createElement('h2')
  h.textContent = existing ? 'Edit meeting note' : 'New meeting note'
  modal.appendChild(h)

  // Title
  const titleField = document.createElement('div')
  titleField.className = 'field'
  titleField.innerHTML = '<label>Title</label>'
  const titleInput = document.createElement('input')
  titleInput.type = 'text'
  titleInput.value = existing?.title ?? ''
  titleInput.placeholder = 'Meeting subject'
  titleField.appendChild(titleInput)
  modal.appendChild(titleField)

  // Date
  const dateField = document.createElement('div')
  dateField.className = 'field'
  dateField.innerHTML = '<label>Date</label>'
  const dateInput = document.createElement('input')
  dateInput.type = 'date'
  dateInput.value = existing?.date ?? todayKey()
  dateField.appendChild(dateInput)
  modal.appendChild(dateField)

  // Attendees
  const attField = document.createElement('div')
  attField.className = 'field'
  attField.innerHTML = '<label>Attendees <span class="field-hint">(comma separated)</span></label>'
  const attInput = document.createElement('input')
  attInput.type = 'text'
  attInput.value = (existing?.attendees ?? []).join(', ')
  attInput.placeholder = 'Alice, Bob, Carol'
  attField.appendChild(attInput)
  modal.appendChild(attField)

  // Project (optional)
  const projField = document.createElement('div')
  projField.className = 'field'
  projField.innerHTML = '<label>Project <span class="field-hint">(optional)</span></label>'
  const projSel = document.createElement('select')
  const noneOpt = document.createElement('option')
  noneOpt.value = ''
  noneOpt.textContent = '— None —'
  projSel.appendChild(noneOpt)
  for (const p of flattenProjects(state.tree)) {
    const o = document.createElement('option')
    o.value = p.id
    o.textContent = p.name
    projSel.appendChild(o)
  }
  projSel.value = existing?.projectId ?? ''
  projField.appendChild(projSel)
  modal.appendChild(projField)

  // Notes body
  const notesField = document.createElement('div')
  notesField.className = 'field'
  notesField.innerHTML = '<label>Notes</label>'
  const notesInput = document.createElement('textarea')
  notesInput.className = 'daily-plan-desc-input meeting-notes-body'
  notesInput.rows = 8
  notesInput.value = existing?.notes ?? ''
  notesInput.placeholder = 'Agenda, decisions, action items…'
  notesField.appendChild(notesInput)
  modal.appendChild(notesField)

  const commit = (): boolean => {
    const title = titleInput.value.trim()
    const notes = notesInput.value
    if (!title && !notes.trim()) {
      titleInput.focus()
      return false
    }
    const attendees = attInput.value
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
    const now = Date.now()
    if (existing) {
      existing.title = title
      existing.date = dateInput.value || todayKey()
      existing.attendees = attendees
      existing.notes = notes
      existing.projectId = projSel.value || undefined
      existing.updatedAt = now
    } else {
      settings.meetingNotes.push({
        id: uid('mtg'),
        title,
        date: dateInput.value || todayKey(),
        attendees,
        notes,
        projectId: projSel.value || undefined,
        createdAt: now,
        updatedAt: now
      })
    }
    saveSoon()
    return true
  }

  const actions = document.createElement('div')
  actions.className = 'modal-actions'
  const cancel = document.createElement('button')
  cancel.textContent = 'Cancel'
  cancel.addEventListener('click', close)
  const save = document.createElement('button')
  save.className = 'primary'
  save.textContent = 'Save'
  save.addEventListener('click', () => {
    if (!commit()) return
    close()
    onSaved()
  })
  actions.append(cancel, save)
  modal.appendChild(actions)

  document.body.appendChild(overlay)
  titleInput.focus()
  titleInput.select()
}
