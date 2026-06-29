import { Component } from '@geajs/core'
import type { Reminder } from '@views/types/types'
import { UITexts } from '@texts'
import { reminderRepo } from '@repositories'
import { fmtWhen, relPast, repeatLabel } from '@ui/screens/reminders/reminders.state'
import { openReminderForm } from '@ui/screens/reminders/components/reminder-form'
import store from '../reminders.store'

// gea port of a reminder row: when/repeat header, text, edit/delete. Edit reuses
// the legacy form with the RAW repo reminder (it mutates the entry on save).
export default class ReminderCard extends Component {
  declare props: { reminder: Reminder; past: boolean }

  private raw = (): Reminder =>
    reminderRepo.getAll().find((r) => r.id === this.props.reminder.id) ?? this.props.reminder

  template({ reminder: r, past }: this['props']) {
    const rep = repeatLabel(r)
    return (
      <div class={'reminder-card' + (past ? ' past' : '')}>
        <div class="reminder-top">
          <span class="reminder-when">{past ? `fired ${relPast(r.firedAt ?? r.time)}` : fmtWhen(r.time)}</span>
          {!past && rep && <span class="reminder-repeat">{'↻ ' + rep}</span>}
        </div>
        <div class="reminder-text">{r.text}</div>
        <div class="reminder-actions">
          <button class="worktree-action" onClick={() => openReminderForm(this.raw())}>
            {past ? UITexts.Reminders.card.remindAgain : UITexts.Reminders.card.edit}
          </button>
          <button class="worktree-action worktree-remove" onClick={() => store.remove(r.id)}>
            {UITexts.Reminders.card.delete}
          </button>
        </div>
      </div>
    )
  }
}
