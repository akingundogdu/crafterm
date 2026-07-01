import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { Bookmark } from '@views/types/types'
import '@views/components/modal/modal.css'
import '@views/components/form-field/form-field.css'
import '@views/screens/reminders/components/remind-chips.css'
import { snoozeOptions, snoozeReminder } from '@views/screens/reminders/reminders.engine'

// gea port of the quick "remind me about this bookmark" picker: one chip per snooze
// option, using the migrated reminders engine. Mounted into a @views overlay backdrop
// by showRemindPicker; a bare modal (no Cancel/OK row) matches the original. State is
// static (props only), so no store. Self-contained — no @ui (§2.7).
export default class RemindPicker extends Component {
  private readonly bookmark: Bookmark
  private readonly onCloseFn: () => void

  // Data via the constructor into plain fields — a gea Component only populates
  // `this.props` when rendered from a parent template, not from a manual `new X()`.
  constructor(opts: { bookmark: Bookmark; onClose: () => void }) {
    super()
    this.bookmark = opts.bookmark
    this.onCloseFn = opts.onClose
  }

  private pick = (at: number): void => {
    const bm = this.bookmark
    snoozeReminder(`Bookmark: ${bm.title}`, at, { kind: 'bookmark', bookmarkId: bm.id })
    this.onCloseFn()
  }

  template() {
    const bm = this.bookmark
    return (
      <div class="modal modal-prompt">
        <button class="modal-close" type="button" aria-label="Close" title="Close" onClick={() => this.onCloseFn()}>
          ×
        </button>
        <h2>{UITexts.Reminders.remindModalTitle}</h2>
        <div class="field-hint">{bm.title}</div>
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
