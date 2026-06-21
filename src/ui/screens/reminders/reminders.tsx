import './reminders.css'
import { UITexts } from '@texts'
import { reminderRepo } from '@repositories'
import type { Reminder, ReminderPayload } from '@ui/types/types'
import { addSnooze, runTick, makeFormOpenClick, makeDeleteClick } from './reminders.state'
import { createReminderCard } from './components/reminder-card'

// Re-exported for the many callers that import these from the reminders module
// (main, spotlight, meetingNotes, notebook, dailyPlan, bookmarks, notifications).
export { openReminderForm } from './components/reminder-form'
export { showRemindModal } from './components/remind-modal'
export { snoozeOptions } from './reminders.state'
export type { SnoozeOption } from './reminders.types'

function listEl(): HTMLElement {
  return document.getElementById('reminder-list')!
}

// Re-arm a reminder (or create one) from a snooze action on its notification card.
export function snoozeReminder(text: string, at: number, payload?: ReminderPayload): void {
  addSnooze(text, at, payload)
  renderReminders()
}

function reminderCard(r: Reminder, past: boolean): HTMLElement {
  return createReminderCard({
    reminder: r,
    past,
    onEdit: makeFormOpenClick(r),
    onDelete: makeDeleteClick(r, renderReminders)
  })
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

function tick(): void {
  runTick(renderReminders)
}

export function startReminderTimer(): void {
  window.setInterval(tick, 20_000) // check every 20s
  tick() // catch anything already due on launch
}
