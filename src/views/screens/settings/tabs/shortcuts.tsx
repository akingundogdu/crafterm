import { Component } from '@geajs/core'
import './shortcuts.css'
import { UITexts } from '@texts'
import { settingsCleanups } from '../shared'
import ShortcutRow from './components/shortcut-row'
import store from './shortcuts.store'

// Reactive body of the shortcuts panel: the live list of keybinding rows. Rendered
// as a JSX child of ShortcutsPanel so gea tracks its `store.rows` + `store.recordingId`
// reads and re-renders it when a recording starts / stops and after every commit /
// reset — the ssh SshList pattern. A top-level, imperatively mounted component
// (ShortcutsPanel) does not re-subscribe on store writes, so the reactive markup
// lives here. Keyed by the stable action id. Self-contained — no @ui.
class ShortcutsList extends Component {
  template() {
    // Read the reactive store fields so this child re-renders on any change.
    const rows = store.rows
    const recordingId = store.recordingId
    return (
      <div class="shortcuts-list">
        {rows.map((row) => (
          <ShortcutRow
            key={row.id}
            label={row.label}
            combo={row.combo}
            isRecording={recordingId === row.id}
            hasOverride={row.hasOverride}
            onStartRecording={() => store.start(row.id)}
            onReset={() => store.reset(row.id)}
          />
        ))}
        {rows.length === 0 && <div class="field-hint">No shortcuts.</div>}
      </div>
    )
  }
}

// Thin shell for the Shortcuts settings panel, mounted imperatively into its
// category container. The static heading + hint live here; the reactive rows are
// the ShortcutsList JSX child. Self-contained — no @ui.
class ShortcutsPanel extends Component {
  template() {
    return (
      <div class="shortcuts-panel">
        <h3>{UITexts.Settings.shortcuts.heading}</h3>
        <div class="field-hint">Click a shortcut, then press the new key combo (Cmd required). Esc cancels.</div>
        <ShortcutsList />
      </div>
    )
  }
}

// Builds the Shortcuts settings panel into its category container. Signature +
// import path preserved so panel-loader resolves unchanged. Seeds the store from
// settings before mounting, and registers a cleanup so an in-flight recording stops
// if the settings modal closes mid-capture.
export function buildShortcutsPanel(panel: HTMLElement): void {
  store.reload()
  settingsCleanups.push(() => store.stop())
  new ShortcutsPanel().render(panel)
}
