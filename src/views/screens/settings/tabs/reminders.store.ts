import { Store } from '@geajs/core'
import { settings } from '@views/state/spine'

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

export default new RemindersStore()
