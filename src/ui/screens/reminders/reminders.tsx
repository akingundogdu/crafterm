import './reminders.css'
import { UITexts } from '@texts'
import { settings, pushNotification, uid } from '@ui/state/state'
import { reminderRepo } from '@repositories'
import type { Reminder, ReminderPayload } from '@ui/types/types'
import { appService , soundService } from '@services'
import { openReminderForm } from './components/reminder-form'

// Re-exported for the many callers that import these from the reminders module
// (main, spotlight, meetingNotes, notebook, dailyPlan, bookmarks, notifications).
export { openReminderForm } from './components/reminder-form'
export { showRemindModal } from './components/remind-modal'

const DAY = 86_400_000
const WEEK = 7 * DAY
const HOUR = 3_600_000

function listEl(): HTMLElement {
  return document.getElementById('reminder-list')!
}

function fmtWhen(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `Today ${time}`
  const tmr = new Date(now.getTime() + DAY)
  if (d.toDateString() === tmr.toDateString()) return `Tomorrow ${time}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time
}

function relPast(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = s / 60
  if (m < 60) return `${Math.floor(m)}m ago`
  const h = m / 60
  if (h < 24) return `${Math.floor(h)}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function repeatLabel(r: Reminder): string {
  if (r.repeat === 'daily') return 'daily'
  if (r.repeat === 'weekly') return 'weekly'
  if (r.repeat === 'biweekly') return 'every 2 weeks'
  if (r.repeat === 'monthly') return 'monthly'
  if (r.repeat === 'interval') return `every ${r.intervalMin ?? 30}m`
  return ''
}

// Snooze offsets offered on a reminder notification card ("remind me later").
export function snoozeOptions(): { label: string; at: number }[] {
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

// Re-arm a reminder (or create one) from a snooze action on its notification card.
// Optional payload links the reminder to a bookmark / pane / notebook entry so
// the eventual notification card can render an Open action.
export function snoozeReminder(text: string, at: number, payload?: ReminderPayload): void {
  reminderRepo.upsert({
    id: uid('rem'),
    text,
    time: at,
    repeat: 'none',
    enabled: true,
    payload
  })
  renderReminders()
}

// Checked on a timer: fire due reminders. Repeats re-schedule; one-shots stay in
// the list as "past" (enabled=false, firedAt set) instead of being dropped.
function tick(): void {
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
  if (changed) renderReminders()
}

function reminderCard(r: Reminder, past: boolean): HTMLElement {
  const when = (
    <span class="reminder-when">{past ? `fired ${relPast(r.firedAt ?? r.time)}` : fmtWhen(r.time)}</span>
  ) as HTMLSpanElement
  const rep = repeatLabel(r)
  const top = (
    <div class="reminder-top">
      {when}
      {rep && !past && <span class="reminder-repeat">{'↻ ' + rep}</span>}
    </div>
  ) as HTMLDivElement

  const text = (<div class="reminder-text">{r.text}</div>) as HTMLDivElement

  const actions = (<div class="reminder-actions" />) as HTMLDivElement
  if (past) {
    const again = (<button class="wt-act">{UITexts.Reminders.card.remindAgain}</button>) as HTMLButtonElement
    again.addEventListener('click', () => openReminderForm(r))
    actions.append(again)
  } else {
    const edit = (<button class="wt-act">{UITexts.Reminders.card.edit}</button>) as HTMLButtonElement
    edit.addEventListener('click', () => openReminderForm(r))
    actions.append(edit)
  }
  const del = (<button class="wt-act wt-remove">{UITexts.Reminders.card.delete}</button>) as HTMLButtonElement
  del.addEventListener('click', () => {
    reminderRepo.remove(r.id)
    renderReminders()
  })
  actions.append(del)

  return (
    <div class={'reminder-card' + (past ? ' past' : '')}>
      {top}
      {text}
      {actions}
    </div>
  ) as HTMLDivElement
}

export function renderReminders(): void {
  const el = listEl()
  el.replaceChildren()
  const upcoming = reminderRepo
    .getAll()
    .filter((r) => r.enabled)
    .sort((a, b) => a.time - b.time)
  const past = reminderRepo
    .getAll()
    .filter((r) => !r.enabled && r.firedAt)
    .sort((a, b) => (b.firedAt ?? 0) - (a.firedAt ?? 0))

  if (!upcoming.length && !past.length) {
    el.insertAdjacentHTML('beforeend', `<div class="notif-empty">${UITexts.Reminders.empty}</div>`)
    return
  }
  for (const r of upcoming) el.appendChild(reminderCard(r, false))
  if (past.length) {
    const head = (<div class="notif-section">{UITexts.Reminders.pastSection}</div>) as HTMLDivElement
    el.appendChild(head)
    for (const r of past) el.appendChild(reminderCard(r, true))
  }
}

export function startReminderTimer(): void {
  window.setInterval(tick, 20_000) // check every 20s
  tick() // catch anything already due on launch
}
