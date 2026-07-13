import { Component } from '@geajs/core'
import './reminders.css'
import '@views/components/form-field/form-field.css'
import { settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { makeInputChange } from '../shared'
import PresetCard from './components/preset-card'
import store from './reminders.store'
import {
  saveDefaultHour,
  commitPresetLabel,
  applyPresetValue,
  addDefaultPreset,
  removePreset,
  presetKind,
  presetInitialValue
} from './reminders.store'

// Reactive body of the reminders panel: the live list of quick-time preset cards
// followed by "+ Add preset". Rendered as a JSX child of RemindersPanel so gea
// tracks its `store.presets` read and re-renders it after every add / remove — the
// ssh SshList pattern. A top-level, imperatively mounted component (RemindersPanel)
// does not re-subscribe on store writes, so the reactive markup lives here. Display
// values come from the mirrored preset; mutations resolve the RAW settings object
// by index (avoiding the store proxy) and persist in place. Keyed by index because
// presets have no id — safe because add / remove re-render the whole list and each
// card re-seeds from the current settings in onAfterRender.
class RemindersPresetList extends Component {
  private onAdd = (): void => {
    addDefaultPreset()
    store.reload()
  }

  template() {
    // Read the reactive store field so this child re-renders on any add / remove.
    const presets = store.presets
    return (
      <div>
        {presets.map((p, idx) => (
          <PresetCard
            key={idx}
            label={p.label}
            kind={presetKind(p)}
            initialValue={presetInitialValue(p)}
            snapHour={p.snapHour === true}
            onCommitLabel={(raw: string) => commitPresetLabel(settings.reminderDefaults.presets[idx], raw)}
            onApplyValue={(kind: string, rawValue: string, snapChecked: boolean) =>
              applyPresetValue(settings.reminderDefaults.presets[idx], kind, rawValue, snapChecked)
            }
            onDelete={() => {
              removePreset(idx)
              store.reload()
            }}
          />
        ))}
        <button class="settings-inline-btn" onClick={this.onAdd}>
          + Add preset
        </button>
      </div>
    )
  }
}

// Thin shell for the Reminders settings panel, mounted imperatively into its
// category container. The static heading + default-hour `.field` + subhead live
// here; the reactive presets list is the RemindersPresetList JSX child. The
// default-hour input is UNCONTROLLED — seeded in onAfterRender — matching the
// shared `labeledInput` markup it replaces. Self-contained — no @ui.
class RemindersPanel extends Component {
  hourInput: HTMLInputElement | null = null

  onAfterRender(): void {
    if (this.hourInput) this.hourInput.value = String(settings.reminderDefaults.defaultHour)
  }

  template() {
    return (
      <div class="reminders-panel">
        <h3>{UITexts.Settings.reminders.heading}</h3>
        <div class="field">
          <label>{UITexts.Settings.reminders.defaultHour}</label>
          <input type="number" ref={this.hourInput} onChange={makeInputChange(saveDefaultHour)} />
        </div>
        <div class="settings-subhead">Quick-time presets</div>
        <RemindersPresetList />
      </div>
    )
  }
}

// Builds the Reminders settings panel into its category container. Signature +
// import path preserved so panel-loader resolves unchanged. Seeds the store from
// settings before mounting so the list renders populated.
export function buildRemindersPanel(panel: HTMLElement): void {
  store.reload()
  new RemindersPanel().render(panel)
}
