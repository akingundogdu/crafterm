import { settings, saveSoon, pushNotification, uid } from './state'
import type { Reminder, ReminderPayload, Bookmark, DailyPlanTask } from './types'
import { makeCloseButton } from './dialog'
import { createDateField } from '@crafterm/ui'
import { appService } from './services/ipc'

const DAY = 86_400_000
const WEEK = 7 * DAY
const HOUR = 3_600_000

function listEl(): HTMLElement {
  return document.getElementById('reminder-list')!
}

// YYYY-MM-DD key (local) for a timestamp — used to home a linked daily task.
function ymdOf(ts: number): string {
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// For a typed reminder, create the linked record (bookmark / link bookmark /
// daily task) and return the payload that ties the reminder back to it.
function createLinkedRecord(
  category: NonNullable<Reminder['category']>,
  body: string,
  ts: number
): ReminderPayload | undefined {
  if (category === 'bookmark' || category === 'link') {
    const bm: Bookmark = {
      id: uid('bm'),
      type: category === 'link' ? 'link' : 'text',
      title: body.split('\n')[0].slice(0, 80) || 'Bookmark',
      content: body,
      tags: [],
      createdAt: Date.now()
    }
    settings.bookmarks.push(bm)
    return { kind: 'bookmark', bookmarkId: bm.id }
  }
  if (category === 'dailyTask') {
    const date = ymdOf(ts)
    const peers = settings.dailyPlan.tasks.filter((t) => t.date === date && t.status === 'todo')
    const now = Date.now()
    const task: DailyPlanTask = {
      id: uid('task'),
      title: body.split('\n')[0].slice(0, 120) || 'Task',
      date,
      status: 'todo',
      priority: 'medium',
      tagIds: [],
      order: peers.length ? Math.max(...peers.map((t) => t.order)) + 1 : 0,
      createdAt: now,
      updatedAt: now
    }
    settings.dailyPlan.tasks.push(task)
    return { kind: 'dailyTask', taskId: task.id }
  }
  return undefined
}

// timestamp → value for <input type="datetime-local"> (local time, no seconds)
function toLocalInput(ts: number): string {
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
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

// Resolve a configurable preset to an absolute timestamp.
function presetAt(p: { offsetMin?: number; days?: number; snapHour?: boolean }): number {
  if (typeof p.offsetMin === 'number') return Date.now() + p.offsetMin * 60_000
  const d = new Date(Date.now() + (p.days ?? 0) * DAY)
  if (p.snapHour) d.setHours(settings.reminderDefaults.defaultHour, 0, 0, 0)
  return d.getTime()
}

// Quick time presets shown in the reminder form (label → absolute timestamp),
// sourced from the user-editable Settings → Reminders config.
function quickPresets(): { label: string; at: () => number }[] {
  const hour = settings.reminderDefaults.defaultHour
  return settings.reminderDefaults.presets.map((p) => ({
    // "Tomorrow"-style chips show the resolved default hour for clarity.
    label: p.snapHour ? `${p.label} ${String(hour).padStart(2, '0')}:00` : p.label,
    at: () => presetAt(p)
  }))
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
  appService.notify('Reminder', r.text)
  if (settings.notifSound) appService.playSound(settings.notifSound)
}

// Re-arm a reminder (or create one) from a snooze action on its notification card.
// Optional payload links the reminder to a bookmark / pane / notebook entry so
// the eventual notification card can render an Open action.
export function snoozeReminder(text: string, at: number, payload?: ReminderPayload): void {
  settings.reminders.push({
    id: uid('rem'),
    text,
    time: at,
    repeat: 'none',
    enabled: true,
    payload
  })
  saveSoon()
  renderReminders()
}

// Checked on a timer: fire due reminders. Repeats re-schedule; one-shots stay in
// the list as "past" (enabled=false, firedAt set) instead of being dropped.
function tick(): void {
  const now = Date.now()
  let changed = false
  for (const r of settings.reminders) {
    if (r.enabled && r.time <= now) {
      fire(r)
      changed = true
      if (r.repeat !== 'none') {
        advance(r, now)
      } else {
        r.enabled = false
        r.firedAt = now
      }
    }
  }
  if (changed) {
    saveSoon()
    renderReminders()
  }
}

function reminderCard(r: Reminder, past: boolean): HTMLElement {
  const card = document.createElement('div')
  card.className = 'reminder-card' + (past ? ' past' : '')
  const top = document.createElement('div')
  top.className = 'reminder-top'
  const when = document.createElement('span')
  when.className = 'reminder-when'
  when.textContent = past ? `fired ${relPast(r.firedAt ?? r.time)}` : fmtWhen(r.time)
  top.append(when)
  const rep = repeatLabel(r)
  if (rep && !past) {
    const badge = document.createElement('span')
    badge.className = 'reminder-repeat'
    badge.textContent = '↻ ' + rep
    top.append(badge)
  }
  const text = document.createElement('div')
  text.className = 'reminder-text'
  text.textContent = r.text
  const actions = document.createElement('div')
  actions.className = 'reminder-actions'
  if (past) {
    const again = document.createElement('button')
    again.className = 'wt-act'
    again.textContent = 'Remind again'
    again.addEventListener('click', () => openReminderForm(r))
    actions.append(again)
  } else {
    const edit = document.createElement('button')
    edit.className = 'wt-act'
    edit.textContent = 'Edit'
    edit.addEventListener('click', () => openReminderForm(r))
    actions.append(edit)
  }
  const del = document.createElement('button')
  del.className = 'wt-act wt-remove'
  del.textContent = 'Delete'
  del.addEventListener('click', () => {
    settings.reminders = settings.reminders.filter((x) => x.id !== r.id)
    saveSoon()
    renderReminders()
  })
  actions.append(del)
  card.append(top, text, actions)
  return card
}

export function renderReminders(): void {
  const el = listEl()
  el.replaceChildren()
  const upcoming = settings.reminders
    .filter((r) => r.enabled)
    .sort((a, b) => a.time - b.time)
  const past = settings.reminders
    .filter((r) => !r.enabled && r.firedAt)
    .sort((a, b) => (b.firedAt ?? 0) - (a.firedAt ?? 0))

  if (!upcoming.length && !past.length) {
    el.insertAdjacentHTML('beforeend', '<div class="notif-empty">No reminders</div>')
    return
  }
  for (const r of upcoming) el.appendChild(reminderCard(r, false))
  if (past.length) {
    const head = document.createElement('div')
    head.className = 'notif-section'
    head.textContent = 'Past reminders'
    el.appendChild(head)
    for (const r of past) el.appendChild(reminderCard(r, true))
  }
}

// Create/edit a reminder via a modal: datetime + quick presets + text + repeat.
// `existing` edits in place (re-arming a past reminder); otherwise a new one is added.
export function openReminderForm(existing?: Reminder): void {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal reminder-modal'
  overlay.appendChild(modal)
  const close = (): void => overlay.remove()
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  modal.appendChild(makeCloseButton(close))

  const reArm = !!existing && !existing.enabled
  const h = document.createElement('h2')
  h.textContent = existing ? (reArm ? 'Remind again' : 'Edit reminder') : 'New reminder'
  modal.appendChild(h)

  // when
  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">When</div>')
  const when = createDateField({
    mode: 'datetime',
    value: toLocalInput(existing && !reArm ? existing.time : Date.now() + HOUR),
    className: 'reminder-input'
  })
  modal.appendChild(when)

  const quick = document.createElement('div')
  quick.className = 'reminder-quick'
  for (const p of quickPresets()) {
    const b = document.createElement('button')
    b.className = 'reminder-preset'
    b.textContent = p.label
    b.addEventListener('click', () => {
      when.value = toLocalInput(p.at())
    })
    quick.appendChild(b)
  }
  modal.appendChild(quick)

  // text
  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Reminder</div>')
  const text = document.createElement('textarea')
  text.className = 'reminder-input reminder-textarea'
  text.rows = 4
  text.placeholder = 'e.g. Stand-up meeting'
  text.value = existing?.text ?? ''
  modal.appendChild(text)

  // type: a new reminder can also create a linked bookmark / link / daily task.
  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Type</div>')
  const typeSel = document.createElement('select')
  typeSel.className = 'settings-select'
  ;[
    ['normal', 'Reminder only'],
    ['bookmark', 'Bookmark'],
    ['link', 'Link'],
    ['dailyTask', 'Daily task']
  ].forEach(([v, lbl]) => {
    const o = document.createElement('option')
    o.value = v
    o.textContent = lbl
    if ((existing?.category ?? 'normal') === v) o.selected = true
    typeSel.appendChild(o)
  })
  // Editing an existing reminder shouldn't silently re-create linked records.
  if (existing) typeSel.disabled = true
  modal.appendChild(typeSel)

  // repeat
  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Repeat</div>')
  const repeatRow = document.createElement('div')
  repeatRow.className = 'reminder-quick'
  const repeat = document.createElement('select')
  repeat.className = 'settings-select'
  ;[
    ['none', 'No repeat'],
    ['daily', 'Daily'],
    ['weekly', 'Weekly'],
    ['biweekly', 'Every 2 weeks'],
    ['monthly', 'Monthly'],
    ['interval', 'Every N minutes']
  ].forEach(([v, lbl]) => {
    const o = document.createElement('option')
    o.value = v
    o.textContent = lbl
    if (existing?.repeat === v) o.selected = true
    repeat.appendChild(o)
  })
  const interval = document.createElement('input')
  interval.type = 'number'
  interval.className = 'reminder-input reminder-interval'
  interval.min = '1'
  interval.value = String(existing?.intervalMin ?? 30)
  interval.style.display = existing?.repeat === 'interval' ? '' : 'none'
  repeat.addEventListener('change', () => {
    interval.style.display = repeat.value === 'interval' ? '' : 'none'
  })
  repeatRow.append(repeat, interval)
  modal.appendChild(repeatRow)

  // actions
  const actions = document.createElement('div')
  actions.className = 'modal-actions'
  const cancel = document.createElement('button')
  cancel.textContent = 'Cancel'
  cancel.addEventListener('click', close)
  const save = document.createElement('button')
  save.className = 'primary'
  save.textContent = existing ? (reArm ? 'Remind again' : 'Save') : 'Add'
  save.addEventListener('click', () => {
    const ts = new Date(when.value).getTime()
    const body = text.value.trim()
    if (!body || !Number.isFinite(ts)) return
    const rep = repeat.value as Reminder['repeat']
    const intervalMin = Math.max(1, parseInt(interval.value, 10) || 30)
    if (existing) {
      existing.text = body
      existing.time = ts
      existing.repeat = rep
      existing.intervalMin = rep === 'interval' ? intervalMin : undefined
      existing.enabled = true
      existing.firedAt = undefined
    } else {
      const category = typeSel.value as NonNullable<Reminder['category']>
      // Cross-create the linked record (bookmark / link / daily task) and point
      // the reminder's payload at it so the notification's Open jumps there.
      const payload = createLinkedRecord(category, body, ts)
      settings.reminders.push({
        id: uid('rem'),
        text: body,
        time: ts,
        repeat: rep,
        intervalMin: rep === 'interval' ? intervalMin : undefined,
        enabled: true,
        category,
        payload
      })
    }
    saveSoon()
    renderReminders()
    close()
  })
  actions.append(cancel, save)
  modal.appendChild(actions)

  document.body.appendChild(overlay)
  when.focus()
}

// Shared "Remind me about this" modal used by bookmarks, notebook items, and any
// other place that wants to attach a reminder with a payload. Renders the same
// snooze-chip grid as the right-panel cards.
export function showRemindModal(
  subject: string,
  reminderText: string,
  payload: ReminderPayload
): void {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal prompt-modal'
  overlay.appendChild(modal)
  const close = (): void => overlay.remove()
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  modal.appendChild(makeCloseButton(close))
  const h = document.createElement('h2')
  h.textContent = 'Remind me about this'
  modal.appendChild(h)
  const sub = document.createElement('div')
  sub.className = 'field-hint'
  sub.textContent = subject
  modal.appendChild(sub)
  const chips = document.createElement('div')
  chips.className = 'bm-remind-chips'
  for (const opt of snoozeOptions()) {
    const b = document.createElement('button')
    b.className = 'bm-remind-chip'
    b.textContent = opt.label
    b.addEventListener('click', () => {
      snoozeReminder(reminderText, opt.at, payload)
      close()
    })
    chips.appendChild(b)
  }
  modal.appendChild(chips)
  document.body.appendChild(overlay)
}

export function startReminderTimer(): void {
  window.setInterval(tick, 20_000) // check every 20s
  tick() // catch anything already due on launch
}
