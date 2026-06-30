import { createOverlay } from '@views/components/overlay/overlay'
import type { Reminder } from '@views/types/types'
import store from './reminder-form.store'
import ReminderForm from './reminder-form'

// Opens the gea reminder add/edit form: a @views overlay backdrop with the gea
// ReminderForm body mounted inside. `existing` edits in place (re-arming a past
// reminder); otherwise a new one is added. The form's save refreshes the reactive
// list itself, so `onSaved` is an optional extra hook. Self-contained — no @ui (§2.7).
export function openReminderForm(existing?: Reminder, onSaved: () => void = () => {}): void {
  const ov = createOverlay({ closeOnBackdrop: true })
  store.open(existing ?? null, onSaved, () => ov.close())
  new ReminderForm().render(ov.overlay)
  ov.mount()
  ;(ov.overlay.querySelector('.reminder-modal .datepicker-field') as HTMLElement | null)?.focus()
}
