import { createModal, createField, createInput, createTextarea, createSelect, createDateField } from '@ui/components'
import { UITexts } from '@texts'
import type { MeetingNote } from '@ui/types/types'
import { state } from '@ui/state/state'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { flattenProjects } from '@ui/catalog/catalog'
import {
  type MeetingFormControls,
  todayKey,
  makeSaveMeeting,
  makeEscapeClose
} from './meeting-form.state'

// Create/edit a meeting note. `onSaved` re-renders the list after upsert.
export function showMeetingForm(existing: MeetingNote | null, onSaved: () => void): void {
  const m = createModal({
    title: existing ? UITexts.MeetingNotes.form.editTitle : UITexts.MeetingNotes.form.newTitle,
    className: 'daily-plan-form',
    confirmText: UITexts.MeetingNotes.form.save
  })
  m.overlay.classList.add('daily-plan-form-overlay')

  let done = false
  const close = (): void => {
    if (done) return
    done = true
    document.removeEventListener('keydown', onKey, true)
    m.close()
  }
  const onKey = makeEscapeClose(close)
  document.addEventListener('keydown', onKey, true)
  m.onClose(close)
  m.modal.prepend(makeCloseButton(close))

  const titleInput = createInput({
    value: existing?.title ?? '',
    placeholder: UITexts.MeetingNotes.form.subjectPlaceholder
  })
  const dateInput = createDateField({ mode: 'date', value: existing?.date ?? todayKey() })
  const attInput = createInput({
    value: (existing?.attendees ?? []).join(', '),
    placeholder: UITexts.MeetingNotes.form.attendeesPlaceholder
  })
  const projSel = createSelect({
    options: flattenProjects(state.tree).map((p) => ({ value: p.id, label: p.name })),
    emptyLabel: UITexts.MeetingNotes.form.noneOption,
    value: existing?.projectId ?? ''
  })
  const notesInput = createTextarea({
    value: existing?.notes ?? '',
    rows: 8,
    placeholder: UITexts.MeetingNotes.form.notesPlaceholder
  })
  notesInput.className = 'daily-plan-desc-input meeting-notes-body'

  m.append(
    createField(UITexts.MeetingNotes.form.fieldTitle, titleInput),
    createField(UITexts.MeetingNotes.form.fieldDate, dateInput),
    createField(UITexts.MeetingNotes.form.fieldAttendees, attInput, { hint: UITexts.MeetingNotes.form.attendeesHint }),
    createField(UITexts.MeetingNotes.form.fieldProject, projSel, { hint: UITexts.MeetingNotes.form.projectHint }),
    createField(UITexts.MeetingNotes.form.fieldNotes, notesInput)
  )

  const controls: MeetingFormControls = { titleInput, dateInput, attInput, projSel, notesInput }
  m.confirmBtn.addEventListener('click', makeSaveMeeting(controls, existing, close, onSaved))
  m.cancelBtn.addEventListener('click', close)

  m.mount()
  titleInput.focus()
  titleInput.select()
}
