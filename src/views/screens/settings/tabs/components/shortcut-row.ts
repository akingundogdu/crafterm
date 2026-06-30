import { el } from '@views/lib/dom'
import { settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { effectiveCombo, comboLabel } from '../../keybindings'

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
  const reset = el('button', { class: 'shortcut-reset', title: UITexts.Settings.shortcuts.resetToDefault, onClick: onReset }, '↺')
  if (!settings.bindings[id]) reset.style.visibility = 'hidden'
  const combo = el(
    'button',
    { class: 'shortcut-combo' + (isRecording ? ' recording' : ''), onClick: () => onStartRecording(id) },
    isRecording ? UITexts.Settings.shortcuts.pressKeys : comboLabel(effectiveCombo(id))
  )
  return el('div', { class: 'shortcut-row' }, el('span', { class: 'shortcut-label' }, label), combo, reset)
}
