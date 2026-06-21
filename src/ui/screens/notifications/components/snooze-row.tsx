import { snoozeOptions } from '../../reminders/reminders'
import { UITexts } from '@texts'
import type { ReminderPayload } from '@ui/types/types'

export interface SnoozeRowProps {
  text: string
  notifId: string
  payload?: ReminderPayload
  onSnoozeClick: (text: string, at: number, payload: ReminderPayload | undefined, notifId: string) => (e: MouseEvent) => void
}

// "Remind me later" snooze controls for a reminder notification card.
export function buildSnoozeRow(props: SnoozeRowProps): HTMLElement {
  return (
    <div class="notif-card-snooze">
      <span class="notif-snooze-label">{UITexts.Notifications.remindMeLater}</span>
      <div class="notif-snooze-chips">
        {snoozeOptions().map(
          (opt) =>
            (
              <button
                class="notif-snooze-chip"
                onClick={props.onSnoozeClick(props.text, opt.at, props.payload, props.notifId)}
              >
                {opt.label}
              </button>
            ) as HTMLButtonElement
        )}
      </div>
    </div>
  ) as HTMLDivElement
}
