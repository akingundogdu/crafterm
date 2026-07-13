import { createOverlay } from '@views/components/overlay/overlay'
import type { MeetingNote } from '@views/types/types'
import store from './meeting-form.store'
import MeetingForm from './meeting-form'

// Opens the gea meeting-note add/edit form: a @views overlay backdrop (with the
// daily-plan-form sizing class) and the gea MeetingForm body mounted inside.
// `onSaved` re-renders the list after upsert. Self-contained — no @ui (§2.7).
export function openMeetingForm(existing: MeetingNote | null, onSaved: () => void): void {
  const ov = createOverlay()
  ov.overlay.classList.add('daily-plan-form-overlay')
  store.open(existing, onSaved, () => ov.close())
  new MeetingForm().render(ov.overlay)
  ov.mount()
  ;(ov.overlay.querySelector('.daily-plan-form input') as HTMLInputElement | null)?.focus()
}
