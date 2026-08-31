import { claudeService } from '@services'

// Real server-side Claude utilization (shape mirrors claudeService.realUsage).
export type RealUsage = Awaited<ReturnType<typeof claudeService.realUsage>>
export type UsageWindow = NonNullable<RealUsage['fiveHour']>
// The model actually in use, read from the newest session jsonl (claudeService.lastModel).
export type LastModel = Awaited<ReturnType<typeof claudeService.lastModel>>

// The right panel's selectable views.
export type RightTab = 'notifs' | 'reminders' | 'files' | 'time' | 'pr' | 'bm'

// A categorical source chip on a notification card.
export interface NotifChip {
  cls: string
  text: string
  title?: string
}

// A resolved reminder-payload action ("open this bookmark / pane / note").
export interface PayloadOpener {
  label: string
  open: () => void
}

// One TERMINAL's notifications, collapsed into a single card (todomr5sckyaei). An
// app-level alert (Claude usage) — or one whose terminal is gone — forms a group of
// one. Both `title` and `paneId` are resolved live from the tree, never from the
// notification's stale snapshot.
export interface NotifGroup {
  key: string
  // Where a click lands. Null when the terminal is gone: the card is then inert
  // rather than pretending it can still jump somewhere.
  paneId: string | null
  title: string
  project: string
  projectColor?: string
  items: import('@views/types/types').AppNotification[]
  // Time of the newest notification in the group — the list is ordered by it.
  latest: number
}
