import { Store } from '@geajs/core'
import { UITexts } from '@texts'
import { settings } from '@views/state/spine'
import { reminderRepo, bookmarkRepo, dailyTaskRepo } from '@repositories'
import type { Reminder, ReminderPayload, Bookmark, DailyPlanTask } from '@views/types/types'
import { uid } from '@views/lib/uid'
import type { QuickPreset } from '../reminders.types'
import remindersStore from '../reminders.store'

const DAY = 86_400_000
const HOUR = 3_600_000

// YYYY-MM-DD key (local) for a timestamp — used to home a linked daily task.
function ymdOf(ts: number): string {
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// timestamp → value for <input type="datetime-local"> (local time, no seconds).
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

// Reactive state + logic for the gea reminder add/edit form (merges the legacy
// reminder-form.state helpers + imperative wiring). Singleton reset on each open.
// The datetime is owned by the embedded imperative DateField widget (read at save);
// the store tracks the text + repeat config (repeat drives the interval input's
// visibility reactively). Self-contained — no @ui (§2.7).
class ReminderFormStore extends Store {
  text = ''
  repeat: Reminder['repeat'] = 'none'
  intervalMin = 30
  category: NonNullable<Reminder['category']> = 'normal'
  existing: Reminder | null = null
  reArm = false
  initialWhen = toLocalInput(Date.now() + HOUR)

  private onSaved: () => void = () => {}
  private closeFn: () => void = () => {}

  open(existing: Reminder | null, onSaved: () => void, close: () => void): void {
    this.existing = existing
    this.reArm = !!existing && !existing.enabled
    this.initialWhen = toLocalInput(existing && !this.reArm ? existing.time : Date.now() + HOUR)
    this.text = existing?.text ?? ''
    this.repeat = existing?.repeat ?? 'none'
    this.intervalMin = existing?.intervalMin ?? 30
    this.category = existing?.category ?? 'normal'
    this.onSaved = onSaved
    this.closeFn = close
  }

  get titleText(): string {
    return this.existing
      ? this.reArm
        ? UITexts.Reminders.form.remindAgainTitle
        : UITexts.Reminders.form.editTitle
      : UITexts.Reminders.form.newTitle
  }

  get saveLabel(): string {
    return this.existing
      ? this.reArm
        ? UITexts.Reminders.form.remindAgain
        : UITexts.Reminders.form.save
      : UITexts.Reminders.form.add
  }

  close(): void {
    this.closeFn()
  }

  // Save/add: validates, persists (creating any linked record for a new typed
  // reminder), refreshes the reactive list, then closes + notifies. `ts` is read
  // from the embedded DateField by the view. Builds a fresh object via spread so a
  // reactive proxy is only READ, never assigned (§5.3).
  save(ts: number): void {
    const body = this.text.trim()
    if (!body || !Number.isFinite(ts)) return
    const rep = this.repeat
    const intervalMin = Math.max(1, this.intervalMin || 30)
    if (this.existing) {
      reminderRepo.upsert({
        ...this.existing,
        text: body,
        time: ts,
        repeat: rep,
        intervalMin: rep === 'interval' ? intervalMin : undefined,
        enabled: true,
        firedAt: undefined
      })
    } else {
      const category = this.category
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
    remindersStore.reload()
    this.close()
    this.onSaved()
  }
}

export default new ReminderFormStore()
