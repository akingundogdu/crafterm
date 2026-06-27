import type { TimeEntry } from '@ui/types/types'

// Time entries collection — extracted from `settings` (was settings.timeEntries).
// Persisted into the single crafterm-state.json; timeEntryRepo operates here.
export const timeEntries: TimeEntry[] = []

export function setTimeEntries(next: TimeEntry[]): void {
  timeEntries.length = 0
  timeEntries.push(...next)
}
