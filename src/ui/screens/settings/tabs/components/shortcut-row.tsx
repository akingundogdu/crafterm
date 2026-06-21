import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { effectiveCombo, comboLabel } from '@ui/keybindings/keybindings'

interface ShortcutRowProps {
  id: string
  label: string
  isRecording: boolean
  onStartRecording: (id: string) => void
  onReset: () => void
}

// One shortcut row: action label + the current/recording combo button + reset.
export function buildShortcutRow(props: ShortcutRowProps): HTMLDivElement {
  const { id, label, isRecording, onStartRecording, onReset } = props
  const reset = (
    <button
      class="shortcut-reset"
      title={UITexts.Settings.shortcuts.resetToDefault}
      onClick={onReset}
    >
      ↺
    </button>
  ) as HTMLButtonElement
  if (!settings.bindings[id]) reset.style.visibility = 'hidden'
  return (
    <div class="shortcut-row">
      <span class="shortcut-label">{label}</span>
      <button
        class={'shortcut-combo' + (isRecording ? ' recording' : '')}
        onClick={() => onStartRecording(id)}
      >
        {isRecording ? UITexts.Settings.shortcuts.pressKeys : comboLabel(effectiveCombo(id))}
      </button>
      {reset}
    </div>
  ) as HTMLDivElement
}
