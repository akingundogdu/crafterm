import { el } from '@views/lib/dom'
import { snoozeOptions, snoozeReminder } from '@views/screens/reminders/reminders.engine'
import type { AppNotification } from '@views/types/types'
import store from '../notifications.store'

// Floating snooze-options menu anchored to a pane card's "Remind me" button. A
// transient, self-managing widget (positioning + outside-click dismissal), so it
// is plain DOM via el() rather than a gea Component (gea reactivity buys nothing).
// Each chip schedules a reminder pointing back at the pane, then dismisses the card.
export function showPaneRemindPicker(anchor: HTMLElement, n: AppNotification): void {
  document.querySelector('.notif-remind-popover')?.remove()

  const close = (): void => pop.remove()
  const pop = el(
    'div',
    { class: 'notif-remind-popover' },
    ...snoozeOptions().map((opt) =>
      el(
        'button',
        {
          class: 'notif-snooze-chip',
          onClick: (e: MouseEvent) => {
            e.stopPropagation()
            snoozeReminder(n.title || n.message, opt.at, { kind: 'pane', paneId: n.paneId })
            close()
            store.dismiss(n.id)
          }
        },
        opt.label
      )
    )
  )

  document.body.append(pop)
  const rect = anchor.getBoundingClientRect()
  pop.style.top = rect.bottom + 4 + 'px'
  pop.style.left = Math.max(8, rect.right - pop.offsetWidth) + 'px'

  const onDown = (ev: MouseEvent): void => {
    if (!pop.contains(ev.target as Node) && ev.target !== anchor) {
      pop.remove()
      document.removeEventListener('mousedown', onDown, true)
    }
  }
  setTimeout(() => document.addEventListener('mousedown', onDown, true))
}
