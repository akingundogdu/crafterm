import { Store } from '@geajs/core'
import { settings } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'

type Preset = (typeof settings.reminderDefaults.presets)[number]

// Reactive state for the reminders quick-time presets list. `presets` mirrors
// settings.reminderDefaults.presets and is read directly in the list view's
// template(), so gea re-renders it after an add / remove — the ssh.store pattern
// (a bare rev counter read via `void store.rev` is NOT tracked by the gea
// compiler, so the mutated list must be a real reactive field the template
// actually reads). In-place label / kind / value edits mutate the underlying
// settings objects (resolved raw by index in the view) and persist without a
// re-render; only structural changes reload + reassign the mirror.
class RemindersStore extends Store {
  presets: Preset[] = []

  reload(): void {
    this.presets = [...settings.reminderDefaults.presets]
  }
}

const store = new RemindersStore()
export default store

// Validates + persists the default reminder hour (0–23).
export function saveDefaultHour(v: string): void {
  const n = parseInt(v, 10)
  if (Number.isInteger(n) && n >= 0 && n <= 23) {
    settings.reminderDefaults.defaultHour = n
    persistence.save()
  }
}

// Commits a preset label (blank falls back to the previous label) and returns
// the resolved label so the view can reflect it back into the input.
export function commitPresetLabel(p: Preset, raw: string): string {
  p.label = raw.trim() || p.label
  persistence.save()
  return p.label
}

// Persists a preset's value as either a day-jump or a relative minute offset.
export function applyPresetValue(p: Preset, kind: string, rawValue: string, snapChecked: boolean): void {
  const n = Math.max(0, parseInt(rawValue, 10) || 0)
  if (kind === 'days') {
    p.days = n
    p.offsetMin = undefined
    p.snapHour = snapChecked ? true : undefined
  } else {
    p.offsetMin = n
    p.days = undefined
    p.snapHour = undefined
  }
  persistence.save()
}

export function addDefaultPreset(): void {
  settings.reminderDefaults.presets.push({ label: '+1h', offsetMin: 60 })
  persistence.save()
}

export function removePreset(idx: number): void {
  settings.reminderDefaults.presets.splice(idx, 1)
  persistence.save()
}

export function presetKind(p: Preset): 'days' | 'offset' {
  return typeof p.days === 'number' ? 'days' : 'offset'
}

export function presetInitialValue(p: Preset): string {
  return String(typeof p.days === 'number' ? p.days : (p.offsetMin ?? 0))
}
