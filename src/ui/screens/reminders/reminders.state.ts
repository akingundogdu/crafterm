import { UITexts } from '@texts'
import { settings, pushNotification, uid } from '@ui/state/state'
import { reminderRepo } from '@repositories'
import type { Reminder, ReminderPayload } from '@ui/types/types'
import { appService, soundService } from '@services'
import { openReminderForm } from './components/reminder-form'
import type { SnoozeOption } from './reminders.types'

const DAY = 86_400_000
const WEEK = 7 * DAY
const HOUR = 3_600_000

export function fmtWhen(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `Today ${time}`
  const tmr = new Date(now.getTime() + DAY)
  if (d.toDateString() === tmr.toDateString()) return `Tomorrow ${time}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time
}

export function relPast(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = s / 60
  if (m < 60) return `${Math.floor(m)}m ago`
  const h = m / 60
  if (h < 24) return `${Math.floor(h)}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function repeatLabel(r: Reminder): string {
  if (r.repeat === 'daily') return 'daily'
  if (r.repeat === 'weekly') return 'weekly'
  if (r.repeat === 'biweekly') return 'every 2 weeks'
  if (r.repeat === 'monthly') return 'monthly'
  if (r.repeat === 'interval') return `every ${r.intervalMin ?? 30}m`
  return ''
}

// Snooze offsets offered on a reminder notification card ("remind me later").
export function snoozeOptions(): SnoozeOption[] {
  const now = Date.now()
  const sameHourIn = (days: number): number => {
    const d = new Date(now + days * DAY)
    return d.getTime()
  }
  return [
    { label: '+15m', at: now + 15 * 60_000 },
    { label: '+30m', at: now + 30 * 60_000 },
    { label: '+45m', at: now + 45 * 60_000 },
    { label: '+1h', at: now + HOUR },
    { label: '+2h', at: now + 2 * HOUR },
    { label: '+3h', at: now + 3 * HOUR },
    { label: '+5h', at: now + 5 * HOUR },
    { label: 'Tomorrow', at: sameHourIn(1) },
    { label: '2 days', at: sameHourIn(2) },
    { label: '4 days', at: sameHourIn(4) }
  ]
}

// Push the reminder's next fire time past `now` (covers missed firings while away).
function advance(r: Reminder, now: number): void {
  if (r.repeat === 'monthly') {
    const d = new Date(r.time)
    do {
      d.setMonth(d.getMonth() + 1)
    } while (d.getTime() <= now)
    r.time = d.getTime()
    return
  }
  const step =
    r.repeat === 'daily'
      ? DAY
      : r.repeat === 'weekly'
        ? WEEK
        : r.repeat === 'biweekly'
          ? 2 * WEEK
          : (r.intervalMin ?? 30) * 60_000
  if (step <= 0) {
    r.enabled = false
    return
  }
  do {
    r.time += step
  } while (r.time <= now)
}

function fire(r: Reminder): void {
  pushNotification('', '⏰ Reminder', '', r.text, {
    kind: 'reminder',
    reminderText: r.text,
    payload: r.payload
  })
  appService.notify(UITexts.Reminders.notifyTitle, r.text)
  if (settings.notifSound) soundService.play(settings.notifSound)
}

// Re-arm a reminder (or create one) from a snooze action. Optional payload links
// the reminder to a bookmark / pane / notebook entry so the eventual notification
// card can render an Open action. Re-rendering is the caller's job.
export function addSnooze(text: string, at: number, payload?: ReminderPayload): void {
  reminderRepo.upsert({
    id: uid('rem'),
    text,
    time: at,
    repeat: 'none',
    enabled: true,
    payload
  })
}

// Checked on a timer: fire due reminders. Repeats re-schedule; one-shots stay in
// the list as "past" (enabled=false, firedAt set) instead of being dropped.
// Invokes `rerender` once if anything changed.
export function runTick(rerender: () => void): void {
  const now = Date.now()
  let changed = false
  for (const r of reminderRepo.getAll()) {
    if (r.enabled && r.time <= now) {
      fire(r)
      changed = true
      if (r.repeat !== 'none') {
        advance(r, now)
      } else {
        r.enabled = false
        r.firedAt = now
      }
      reminderRepo.upsert(r)
    }
  }
  if (changed) rerender()
}

// Opens the reminder form to edit / re-arm a card's reminder.
export function makeFormOpenClick(r: Reminder): () => void {
  return () => openReminderForm(r)
}

// Deletes a card's reminder, then re-renders the list.
export function makeDeleteClick(r: Reminder, rerender: () => void): () => void {
  return () => {
    reminderRepo.remove(r.id)
    rerender()
  }
}
