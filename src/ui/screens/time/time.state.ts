import { uid } from '@ui/state/state'
import { timeEntryRepo } from '@repositories'
import type { Pane } from '@ui/types/types'

export const IDLE_MS = 5 * 60_000 // no activity this long ⇒ stop auto-counting

// Log a tracked interval (if it ran at least a second) under the given source.
export function logInterval(
  session: { projectPath: string; featureId: string | null; start: number },
  source: 'manual' | 'pomodoro' | 'auto'
): void {
  const dur = Date.now() - session.start
  if (dur < 1000) return
  timeEntryRepo.upsert({
    id: uid('te'),
    projectPath: session.projectPath,
    featureId: session.featureId || undefined,
    start: session.start,
    end: Date.now(),
    source
  })
}

// Whether automatic tracking should run for `pane` right now: it must be tracked,
// the window focused, and either the user or the terminal recently active.
export function shouldTrackPane(pane: Pane | null | undefined, lastUserActivity: number): boolean {
  if (!pane?.trackProjectPath) return false
  const userActive = Date.now() - lastUserActivity < IDLE_MS
  const termActive = Date.now() - pane.lastActivity < IDLE_MS
  return document.hasFocus() && (userActive || termActive)
}
