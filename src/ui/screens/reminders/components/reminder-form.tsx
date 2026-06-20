import { createOverlay, createButton, createSelect, createTextarea, createDateField } from '@ui/components'
import { UITexts } from '@texts'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import type { Reminder } from '@ui/types/types'
import {
  toLocalInput,
  quickPresets,
  makePresetClick,
  makeIntervalSetup,
  makeRepeatChange,
  makeSaveReminder
} from './reminder-form.state'

const HOUR = 3_600_000

// Create/edit a reminder via a modal: datetime + quick presets + text + repeat.
// `existing` edits in place (re-arming a past reminder); otherwise a new one is added.
export function openReminderForm(existing?: Reminder): void {
  const ov = createOverlay({ closeOnBackdrop: true })

  const reArm = !!existing && !existing.enabled

  // when
  const when = createDateField({
    mode: 'datetime',
    value: toLocalInput(existing && !reArm ? existing.time : Date.now() + HOUR),
    className: 'reminder-input'
  })

  const quick = (
    <div class="reminder-quick">
      {quickPresets().map((p) =>
        createButton({ text: p.label, className: 'reminder-preset', onClick: makePresetClick(when, p) })
      )}
    </div>
  ) as HTMLDivElement

  // text
  const text = createTextarea({
    rows: 4,
    placeholder: UITexts.Reminders.form.textPlaceholder,
    value: existing?.text ?? ''
  })
  text.className = 'reminder-input reminder-textarea'

  // type: a new reminder can also create a linked bookmark / link / daily task.
  const typeSel = createSelect({
    options: [
      { value: 'normal', label: UITexts.Reminders.form.type.normal },
      { value: 'bookmark', label: UITexts.Reminders.form.type.bookmark },
      { value: 'link', label: UITexts.Reminders.form.type.link },
      { value: 'dailyTask', label: UITexts.Reminders.form.type.dailyTask }
    ],
    value: existing?.category ?? 'normal'
  })
  typeSel.className = 'settings-select'
  // Editing an existing reminder shouldn't silently re-create linked records.
  if (existing) typeSel.disabled = true

  // repeat
  const repeat = createSelect({
    options: [
      { value: 'none', label: UITexts.Reminders.form.repeat.none },
      { value: 'daily', label: UITexts.Reminders.form.repeat.daily },
      { value: 'weekly', label: UITexts.Reminders.form.repeat.weekly },
      { value: 'biweekly', label: UITexts.Reminders.form.repeat.biweekly },
      { value: 'monthly', label: UITexts.Reminders.form.repeat.monthly },
      { value: 'interval', label: UITexts.Reminders.form.repeat.interval }
    ],
    value: existing?.repeat ?? 'none'
  })
  repeat.className = 'settings-select'
  const interval = (
    <input type="number" class="reminder-input reminder-interval" min="1" ref={makeIntervalSetup(existing)} />
  ) as HTMLInputElement
  repeat.addEventListener('change', makeRepeatChange(repeat, interval))
  const repeatRow = (
    <div class="reminder-quick">
      {repeat}
      {interval}
    </div>
  ) as HTMLDivElement

  // actions
  const actions = (
    <div class="modal-actions">
      {createButton({ text: UITexts.Reminders.form.cancel, onClick: ov.close })}
      {createButton({
        text: existing
          ? reArm
            ? UITexts.Reminders.form.remindAgain
            : UITexts.Reminders.form.save
          : UITexts.Reminders.form.add,
        variant: 'primary',
        onClick: makeSaveReminder({ existing, when, text, repeat, interval, typeSel, close: ov.close })
      })}
    </div>
  ) as HTMLDivElement

  const modal = (
    <div class="modal reminder-modal">
      {makeCloseButton(ov.close)}
      <h2>
        {existing
          ? reArm
            ? UITexts.Reminders.form.remindAgainTitle
            : UITexts.Reminders.form.editTitle
          : UITexts.Reminders.form.newTitle}
      </h2>
      <div class="reminder-label">{UITexts.Reminders.form.labelWhen}</div>
      {when}
      {quick}
      <div class="reminder-label">{UITexts.Reminders.form.labelReminder}</div>
      {text}
      <div class="reminder-label">{UITexts.Reminders.form.labelType}</div>
      {typeSel}
      <div class="reminder-label">{UITexts.Reminders.form.labelRepeat}</div>
      {repeatRow}
      {actions}
    </div>
  ) as HTMLDivElement

  ov.overlay.appendChild(modal)
  ov.mount()
  when.focus()
}
