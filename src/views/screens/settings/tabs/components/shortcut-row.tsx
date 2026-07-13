import { Component } from '@geajs/core'
import { UITexts } from '@texts'

export interface ShortcutRowProps {
  label: string
  combo: string
  isRecording: boolean
  hasOverride: boolean
  onStartRecording: () => void
  onReset: () => void
}

// One shortcut row: action label + the current/recording combo button + reset.
// Rendered as a keyed JSX child of the list, so gea populates `this.props`. The
// nested-button onClick handlers are safe here because this is the row's OWN
// template, not a `.map()` body (the gea plugin mis-compiles a handler on a
// non-root element inside a keyed map). The reset stays hidden (not removed) when
// the action has no override, mirroring the former `visibility: hidden` toggle.
// Self-contained — no @ui.
export default class ShortcutRow extends Component {
  declare props: ShortcutRowProps

  template({ label, combo, isRecording, hasOverride, onStartRecording, onReset }: this['props']) {
    return (
      <div class="shortcut-row">
        <span class="shortcut-label">{label}</span>
        <button class={'shortcut-combo' + (isRecording ? ' recording' : '')} onClick={onStartRecording}>
          {isRecording ? UITexts.Settings.shortcuts.pressKeys : combo}
        </button>
        <button
          class="shortcut-reset"
          title={UITexts.Settings.shortcuts.resetToDefault}
          style={hasOverride ? undefined : { visibility: 'hidden' }}
          onClick={onReset}
        >
          ↺
        </button>
      </div>
    )
  }
}
