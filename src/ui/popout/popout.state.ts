import { terminalService } from '@services'
import { promptConfirm } from '@ui/components/dialog/dialog'

// Mirror the main app's "running" heuristic (busy = output within ~700ms).
export const BUSY_MS = 700

// Shift+Enter inserts a newline in TUI line editors (parity with docked panes,
// see pane.ts): send ESC+CR instead of the bare CR xterm would emit as "submit".
export function makeCustomKeyHandler(id: string): (e: KeyboardEvent) => boolean {
  return (e) => {
    if (
      e.type === 'keydown' &&
      e.key === 'Enter' &&
      e.shiftKey &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey
    ) {
      terminalService.input(id, '\x1b\r')
      return false
    }
    return true
  }
}

// Native close-button handler: the main process asks us to confirm first. Only
// prompt if a process appears to be running (output within BUSY_MS), then tear
// the pane down.
export function makeConfirmClose(
  id: string,
  getLastData: () => number
): (closeId: string) => Promise<void> {
  return async (closeId) => {
    if (closeId !== id) return
    const running = Date.now() - getLastData() < BUSY_MS
    if (running) {
      const ok = await promptConfirm({
        title: 'Close terminal?',
        message: 'A process is still running in this terminal. Close anyway?',
        confirmText: 'Close'
      })
      if (!ok) return
    }
    terminalService.popoutConfirmClose(id)
  }
}
