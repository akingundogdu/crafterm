import { UITexts } from '@texts'
import type { DateField } from '@ui/components'
import { settings, uid } from '@ui/state/state'
import { reminderRepo, bookmarkRepo, dailyTaskRepo } from '@repositories'
import type { Reminder, ReminderPayload, Bookmark, DailyPlanTask } from '@ui/types/types'
import { renderReminders } from '../reminders'
import type { QuickPreset } from './reminder-form.types'

const DAY = 86_400_000

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
      title: body.split('\n')[0].slice(0, 80) || UITexts.Reminders.defaultBookmarkTitle,
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
      title: body.split('\n')[0].slice(0, 120) || UITexts.Reminders.defaultTaskTitle,
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
export function toLocalInput(ts: number): string {
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
export function quickPresets(): QuickPreset[] {
  const hour = settings.reminderDefaults.defaultHour
  return settings.reminderDefaults.presets.map((p) => ({
    // "Tomorrow"-style chips show the resolved default hour for clarity.
    label: p.snapHour ? `${p.label} ${String(hour).padStart(2, '0')}:00` : p.label,
    at: () => presetAt(p)
  }))
}

// Sets a preset's resolved time into the datetime field.
export function makePresetClick(when: DateField, preset: QuickPreset): () => void {
  return () => {
    when.value = toLocalInput(preset.at())
  }
}

// Seeds the interval input's initial value + visibility from the edited reminder.
export function makeIntervalSetup(existing?: Reminder): (el: HTMLInputElement) => void {
  return (el) => {
    el.value = String(existing?.intervalMin ?? 30)
    el.style.display = existing?.repeat === 'interval' ? '' : 'none'
  }
}

// Toggles the interval input when the repeat mode changes.
export function makeRepeatChange(repeat: HTMLSelectElement, interval: HTMLInputElement): () => void {
  return () => {
    interval.style.display = repeat.value === 'interval' ? '' : 'none'
  }
}

// Save/add handler: validates, persists (creating any linked record for a new
// typed reminder), re-renders, then closes.
export function makeSaveReminder(opts: {
  existing?: Reminder
  when: DateField
  text: HTMLTextAreaElement
  repeat: HTMLSelectElement
  interval: HTMLInputElement
  typeSel: HTMLSelectElement
  close: () => void
}): () => void {
  return () => {
    const ts = new Date(opts.when.value).getTime()
    const body = opts.text.value.trim()
    if (!body || !Number.isFinite(ts)) return
    const rep = opts.repeat.value as Reminder['repeat']
    const intervalMin = Math.max(1, parseInt(opts.interval.value, 10) || 30)
    if (opts.existing) {
      opts.existing.text = body
      opts.existing.time = ts
      opts.existing.repeat = rep
      opts.existing.intervalMin = rep === 'interval' ? intervalMin : undefined
      opts.existing.enabled = true
      opts.existing.firedAt = undefined
      reminderRepo.upsert(opts.existing)
    } else {
      const category = opts.typeSel.value as NonNullable<Reminder['category']>
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
    opts.close()
  }
}
