import type { AppNotification } from '@views/types/types'
import RemindPopover from './remind-popover'

// Opens the floating snooze-options menu anchored to a pane card's "Remind me"
// button. The card re-renders when the button is clicked, so the anchor node can
// detach — we snapshot its rect at entry. The gea RemindPopover is rendered into
// <body> (NOT moved out of its gea render tree — that would break gea's event
// wiring, so the chips would stop firing), then positioned under the anchor and
// CLAMPED to the viewport so it is always on-screen and interactable.
export function showPaneRemindPicker(anchor: HTMLElement, n: AppNotification): void {
  document.querySelector('.notif-remind-popover')?.remove()
  const rect = anchor.getBoundingClientRect()

  const comp = new RemindPopover({ anchor, notif: n, onClose: () => close() })
  comp.render(document.body)
  const pop = document.querySelector('.notif-remind-popover') as HTMLElement | null
  if (!pop) return

  const w = pop.offsetWidth || 260
  const h = pop.offsetHeight || 60
  pop.style.top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - h - 8)) + 'px'
  pop.style.left = Math.max(8, Math.min(rect.right - w, window.innerWidth - w - 8)) + 'px'

  const onDown = (ev: MouseEvent): void => {
    if (!pop.contains(ev.target as Node) && ev.target !== anchor) close()
  }
  const close = (): void => {
    pop.remove()
    document.removeEventListener('mousedown', onDown, true)
  }
  setTimeout(() => document.addEventListener('mousedown', onDown, true))
}
