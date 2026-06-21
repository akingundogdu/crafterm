import { createSelect } from '@ui/components'
import { UITexts } from '@texts'
import type { Reminder } from '@ui/types/types'
import { makeIntervalSetup, makeRepeatChange } from './reminder-form.state'

interface RepeatSelectorHandle {
  row: HTMLDivElement
  repeat: HTMLSelectElement
  interval: HTMLInputElement
}

// Repeat dropdown + interval input row for the reminder form. Pure view — exposes
// the live `repeat`/`interval` controls so the form can read them on save.
export function createRepeatSelector(existing?: Reminder): RepeatSelectorHandle {
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
  const row = (
    <div class="reminder-quick">
      {repeat}
      {interval}
    </div>
  ) as HTMLDivElement
  return { row, repeat, interval }
}
