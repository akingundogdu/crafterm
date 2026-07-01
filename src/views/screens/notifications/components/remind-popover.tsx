import { Component } from '@geajs/core'
import type { AppNotification } from '@views/types/types'
import { snoozeOptions, snoozeReminder } from '@views/screens/reminders/reminders.engine'
import store from '../notifications.store'

// gea port of the floating snooze-options menu anchored to a pane card's "Remind
// me" button. Instantiated imperatively by showPaneRemindPicker, which positions
// it in <body>. Each chip schedules a reminder pointing back at the pane, then
// dismisses the card. Data is passed via the constructor into plain fields (a gea
// Component only populates `this.props` when the framework renders it from a
// parent template — a manual `new X({...})` does NOT). Self-contained — no @ui.
export default class RemindPopover extends Component {
  rootEl: HTMLElement | null = null
  private readonly notif: AppNotification
  private readonly onCloseFn: () => void

  constructor(opts: { anchor: HTMLElement; notif: AppNotification; onClose: () => void }) {
    super()
    this.notif = opts.notif
    this.onCloseFn = opts.onClose
  }

  private pick = (at: number, e: MouseEvent): void => {
    e.stopPropagation()
    const n = this.notif
    snoozeReminder(n.title || n.message, at, { kind: 'pane', paneId: n.paneId })
    this.onCloseFn()
    store.dismiss(n.id)
  }

  template() {
    return (
      <div class="notif-remind-popover" ref={this.rootEl}>
        {snoozeOptions().map((opt) => (
          <button key={opt.label} class="notif-snooze-chip" onClick={(e: MouseEvent) => this.pick(opt.at, e)}>
            {opt.label}
          </button>
        ))}
      </div>
    )
  }
}
