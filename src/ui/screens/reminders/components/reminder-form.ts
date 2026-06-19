import { createOverlay, createButton, createSelect, createTextarea, createDateField } from '@ui/components'
import { makeCloseButton } from '../../../dialog'
import { settings, uid } from '../../../state'
import { reminderRepo, bookmarkRepo, dailyTaskRepo } from '@services/storage/repositories'
import type { Reminder, ReminderPayload, Bookmark, DailyPlanTask } from '../../../types'
import { renderReminders } from '../reminders'

const DAY = 86_400_000
const HOUR = 3_600_000

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
    bookmarkRepo.upsert(bm)
    return { kind: 'bookmark', bookmarkId: bm.id }
  }
  if (category === 'dailyTask') {
    const date = ymdOf(ts)
    const peers = dailyTaskRepo.query((t) => t.date === date && t.status === 'todo')
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
    dailyTaskRepo.upsert(task)
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

// Create/edit a reminder via a modal: datetime + quick presets + text + repeat.
// `existing` edits in place (re-arming a past reminder); otherwise a new one is added.
export function openReminderForm(existing?: Reminder): void {
  const ov = createOverlay({ closeOnBackdrop: true })
  const modal = document.createElement('div')
  modal.className = 'modal reminder-modal'
  ov.overlay.appendChild(modal)
  modal.appendChild(makeCloseButton(ov.close))

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
    quick.appendChild(
      createButton({
        text: p.label,
        className: 'reminder-preset',
        onClick: () => {
          when.value = toLocalInput(p.at())
        }
      })
    )
  }
  modal.appendChild(quick)

  // text
  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Reminder</div>')
  const text = createTextarea({ rows: 4, placeholder: 'e.g. Stand-up meeting', value: existing?.text ?? '' })
  text.className = 'reminder-input reminder-textarea'
  modal.appendChild(text)

  // type: a new reminder can also create a linked bookmark / link / daily task.
  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Type</div>')
  const typeSel = createSelect({
    options: [
      { value: 'normal', label: 'Reminder only' },
      { value: 'bookmark', label: 'Bookmark' },
      { value: 'link', label: 'Link' },
      { value: 'dailyTask', label: 'Daily task' }
    ],
    value: existing?.category ?? 'normal'
  })
  typeSel.className = 'settings-select'
  // Editing an existing reminder shouldn't silently re-create linked records.
  if (existing) typeSel.disabled = true
  modal.appendChild(typeSel)

  // repeat
  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Repeat</div>')
  const repeatRow = document.createElement('div')
  repeatRow.className = 'reminder-quick'
  const repeat = createSelect({
    options: [
      { value: 'none', label: 'No repeat' },
      { value: 'daily', label: 'Daily' },
      { value: 'weekly', label: 'Weekly' },
      { value: 'biweekly', label: 'Every 2 weeks' },
      { value: 'monthly', label: 'Monthly' },
      { value: 'interval', label: 'Every N minutes' }
    ],
    value: existing?.repeat ?? 'none'
  })
  repeat.className = 'settings-select'
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
  actions.append(
    createButton({ text: 'Cancel', onClick: ov.close }),
    createButton({
      text: existing ? (reArm ? 'Remind again' : 'Save') : 'Add',
      variant: 'primary',
      onClick: () => {
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
          reminderRepo.upsert(existing)
        } else {
          const category = typeSel.value as NonNullable<Reminder['category']>
          // Cross-create the linked record (bookmark / link / daily task) and point
          // the reminder's payload at it so the notification's Open jumps there.
          const payload = createLinkedRecord(category, body, ts)
          reminderRepo.upsert({
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
        renderReminders()
        ov.close()
      }
    })
  )
  modal.appendChild(actions)

  ov.mount()
  when.focus()
}
