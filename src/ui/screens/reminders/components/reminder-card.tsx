import { UITexts } from '@texts'
import type { Reminder } from '@ui/types/types'
import { fmtWhen, relPast, repeatLabel } from '../reminders.state'

interface ReminderCardOptions {
  reminder: Reminder
  past: boolean
  onEdit: () => void
  onDelete: () => void
}

// A single reminder row: when/repeat header, text, and edit/delete actions. Pure
// view — the click handlers are injected so the card carries no IPC/state.
export function createReminderCard(opts: ReminderCardOptions): HTMLDivElement {
  const { reminder: r, past } = opts
  const rep = repeatLabel(r)
  return (
    <div class={'reminder-card' + (past ? ' past' : '')}>
      <div class="reminder-top">
        <span class="reminder-when">
          {past ? `fired ${relPast(r.firedAt ?? r.time)}` : fmtWhen(r.time)}
        </span>
        {rep && !past && <span class="reminder-repeat">{'↻ ' + rep}</span>}
      </div>
      <div class="reminder-text">{r.text}</div>
      <div class="reminder-actions">
        <button class="worktree-action" onClick={opts.onEdit}>
          {past ? UITexts.Reminders.card.remindAgain : UITexts.Reminders.card.edit}
        </button>
        <button class="worktree-action worktree-remove" onClick={opts.onDelete}>
          {UITexts.Reminders.card.delete}
        </button>
      </div>
    </div>
  ) as HTMLDivElement
}
