import type { Pane } from '@views/types/types'
import { panes, poppedOut, state } from '@views/state/spine'

// While Claude waits on the user in a pane nobody is looking at, the pane pulses
// (pane-box.css). The waiting hook marks the pane when Claude stops or asks for
// input and clears it when the user answers; main forwards each change as
// `claude:waitingChanged`. The flash stops as soon as the user looks at the pane
// (it becomes the active pane of the focused window) or types into it.
export const WAITING_FLASH_CLASS = 'pane-box-waiting'

// The user is looking at a pane when its window has focus and it is the active pane.
export function isPaneAttended(paneId: string, activePaneId: string | null, hasWindowFocus: boolean): boolean {
  return hasWindowFocus && paneId === activePaneId
}

export function setWaitingFlash(pane: Pane, isFlashing: boolean): void {
  pane.el.classList.toggle(WAITING_FLASH_CLASS, isFlashing)
}

// Claude started or stopped waiting in the pane with `paneStableId`. A pane the
// user is already looking at does not flash, and neither does the hidden main-
// window copy of a popped-out pane (its pop-out window flashes instead).
export function onClaudeWaitingChanged(paneStableId: string, isWaiting: boolean): void {
  for (const pane of panes.values()) {
    if (pane.stableId !== paneStableId) continue
    if (poppedOut.has(pane.id)) {
      setWaitingFlash(pane, false)
      continue
    }
    const isAttended = isPaneAttended(pane.id, state.activePaneId, document.hasFocus())
    setWaitingFlash(pane, isWaiting && !isAttended)
  }
}

// The active pane became visible to the user (pane switch or window focus): stop
// its flash.
export function acknowledgeActivePane(): void {
  if (!state.activePaneId || !document.hasFocus()) return
  const pane = panes.get(state.activePaneId)
  if (pane) setWaitingFlash(pane, false)
}
