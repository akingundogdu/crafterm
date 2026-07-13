import { claudeService } from '@services'

// Real server-side Claude utilization (shape mirrors claudeService.realUsage).
export type RealUsage = Awaited<ReturnType<typeof claudeService.realUsage>>
export type UsageWindow = NonNullable<RealUsage['fiveHour']>

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

// The kind filter above the Alerts list. 'all' = no filter.
export type NotifKindFilter = 'all' | 'question' | 'done' | 'reminder'

// Notifications from one terminal, collapsed into a single card (todomr5sckyaei).
// A notification with no pane (Claude usage, app alerts) forms a group of one.
export interface NotifGroup {
  key: string
  paneId: string
  title: string
  project: string
  projectColor?: string
  items: import('@views/types/types').AppNotification[]
  // Time of the newest notification in the group — the list is ordered by it.
  latest: number
}
