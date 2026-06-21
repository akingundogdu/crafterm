import { snoozeOptions } from '../../reminders/reminders'
import type { AppNotification } from '@ui/types/types'

export interface RemindPopoverProps {
  notif: AppNotification
  close: () => void
  onChipClick: (n: AppNotification, at: number, close: () => void) => (e: MouseEvent) => void
}

// Floating snooze options menu anchored to a pane card's "Remind me" button.
// Positioning and outside-click dismissal are owned by the caller.
export function buildRemindPopover(props: RemindPopoverProps): HTMLElement {
  return (
    <div class="notif-remind-popover">
      {snoozeOptions().map(
        (opt) =>
          (
            <button class="notif-snooze-chip" onClick={props.onChipClick(props.notif, opt.at, props.close)}>
              {opt.label}
            </button>
          ) as HTMLButtonElement
      )}
    </div>
  ) as HTMLDivElement
}
