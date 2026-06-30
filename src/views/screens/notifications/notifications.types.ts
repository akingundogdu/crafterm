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
