import { Component } from '@geajs/core'
import '@views/components/modal/modal.css'
import '@views/components/form-field/form-field.css'
import './remind-chips.css'
import { UITexts } from '@texts'
import type { ReminderPayload } from '@views/types/types'
import { createOverlay } from '@views/components/overlay/overlay'
import { snoozeOptions, snoozeReminder } from '../reminders.engine'

// Shared "Remind me about this" modal used by daily-plan tasks, meeting notes, and
// any place that attaches a reminder with a payload. Renders the same snooze-chip
// grid as the right-panel cards. State is static (props only), so no store — mirrors
// the legacy showRemindModal. Self-contained — no @ui (§2.7).
export default class RemindModal extends Component {
  private readonly subject: string
  private readonly reminderText: string
  private readonly payload: ReminderPayload
  private readonly onCloseFn: () => void

  // Data via the constructor into plain fields — a gea Component only populates
  // `this.props` when rendered from a parent template, not from a manual `new X()`.
  constructor(opts: { subject: string; reminderText: string; payload: ReminderPayload; onClose: () => void }) {
    super()
    this.subject = opts.subject
    this.reminderText = opts.reminderText
    this.payload = opts.payload
    this.onCloseFn = opts.onClose
  }

  private pick = (at: number): void => {
    snoozeReminder(this.reminderText, at, this.payload)
    this.onCloseFn()
  }

  template() {
    return (
      <div class="modal modal-prompt">
        <button class="modal-close" type="button" aria-label="Close" title="Close" onClick={() => this.onCloseFn()}>
          ×
        </button>
        <h2>{UITexts.Reminders.remindModalTitle}</h2>
        <div class="field-hint">{this.subject}</div>
        <div class="bookmarks-remind-chips">
          {snoozeOptions().map((opt) => (
            <button key={opt.label} class="bookmarks-remind-chip" onClick={() => this.pick(opt.at)}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    )
  }
}

// Opens the gea "Remind me about this" modal: a @views overlay backdrop with the gea
// RemindModal body mounted inside. Signature preserved so every consumer (daily-plan
// tasks/compact cards, meeting notes, notebook) resolves unchanged.
export function showRemindModal(subject: string, reminderText: string, payload: ReminderPayload): void {
  const ov = createOverlay({ closeOnBackdrop: true })
  new RemindModal({ subject, reminderText, payload, onClose: () => ov.close() }).render(ov.overlay)
  ov.mount()
}
