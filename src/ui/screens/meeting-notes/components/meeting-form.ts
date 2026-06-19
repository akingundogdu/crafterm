import { createModal, createField, createInput, createTextarea, createSelect, createDateField } from '@ui/components'
import type { MeetingNote } from '../../../types'
import { state, uid } from '../../../state'
import { meetingNoteRepo } from '@services/storage/repositories'
import { makeCloseButton } from '../../../dialog'
import { flattenProjects } from '../../../catalog'

function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Create/edit a meeting note. `onSaved` re-renders the list after upsert.
export function showMeetingForm(existing: MeetingNote | null, onSaved: () => void): void {
  const m = createModal({
    title: existing ? 'Edit meeting note' : 'New meeting note',
    className: 'daily-plan-form',
    confirmText: 'Save'
  })
  m.overlay.classList.add('daily-plan-form-overlay')

  let done = false
  const close = (): void => {
    if (done) return
    done = true
    document.removeEventListener('keydown', onKey, true)
    m.close()
  }
  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKey, true)
  m.onClose(close)
  m.modal.prepend(makeCloseButton(close))

  const titleInput = createInput({ value: existing?.title ?? '', placeholder: 'Meeting subject' })
  const dateInput = createDateField({ mode: 'date', value: existing?.date ?? todayKey() })
  const attInput = createInput({
    value: (existing?.attendees ?? []).join(', '),
    placeholder: 'Alice, Bob, Carol'
  })
  const projSel = createSelect({
    options: flattenProjects(state.tree).map((p) => ({ value: p.id, label: p.name })),
    emptyLabel: '— None —',
    value: existing?.projectId ?? ''
  })
  const notesInput = createTextarea({
    value: existing?.notes ?? '',
    rows: 8,
    placeholder: 'Agenda, decisions, action items…'
  })
  notesInput.className = 'daily-plan-desc-input meeting-notes-body'

  m.append(
    createField('Title', titleInput),
    createField('Date', dateInput),
    createField('Attendees', attInput, { hint: '(comma separated)' }),
    createField('Project', projSel, { hint: '(optional)' }),
    createField('Notes', notesInput)
  )

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
      meetingNoteRepo.upsert(existing)
    } else {
      meetingNoteRepo.upsert({
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
    return true
  }

  m.confirmBtn.addEventListener('click', () => {
    if (!commit()) return
    close()
    onSaved()
  })
  m.cancelBtn.addEventListener('click', close)

  m.mount()
  titleInput.focus()
  titleInput.select()
}
