import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import {
  KEYBINDINGS,
  effectiveCombo,
  comboLabel,
  comboFromEvent,
  setBinding,
  resetBinding,
  setRecording,
  isModifierKey
} from '@ui/keybindings/keybindings'
import { settingsCleanups } from '../shared'

export function buildShortcutsPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.shortcuts.heading}</h3>`)
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Click a shortcut, then press the new key combo (Cmd required). Esc cancels.</div>'
  )
  const list = (<div class="shortcuts-list" />) as HTMLDivElement
  panel.appendChild(list)

  let recordingId: string | null = null
  let handler: ((e: KeyboardEvent) => void) | null = null

  const stop = (): void => {
    if (handler) window.removeEventListener('keydown', handler, true)
    handler = null
    recordingId = null
    setRecording(false)
  }
  settingsCleanups.push(stop) // stop recording if the modal is closed mid-capture

  const render = (): void => {
    list.replaceChildren()
    KEYBINDINGS.forEach((a) => {
      const reset = (
        <button
          class="shortcut-reset"
          title={UITexts.Settings.shortcuts.resetToDefault}
          onClick={() => {
            resetBinding(a.id)
            persistence.save()
            render()
          }}
        >
          ↺
        </button>
      ) as HTMLButtonElement
      if (!settings.bindings[a.id]) reset.style.visibility = 'hidden'
      const row = (
        <div class="shortcut-row">
          <span class="shortcut-label">{a.label}</span>
          <button
            class={'shortcut-combo' + (recordingId === a.id ? ' recording' : '')}
            onClick={() => startRecording(a.id)}
          >
            {recordingId === a.id ? UITexts.Settings.shortcuts.pressKeys : comboLabel(effectiveCombo(a.id))}
          </button>
          {reset}
        </div>
      ) as HTMLDivElement
      list.appendChild(row)
    })
  }

  const startRecording = (id: string): void => {
    stop()
    recordingId = id
    setRecording(true)
    render()
    handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        stop()
        render()
        return
      }
      e.preventDefault()
      e.stopPropagation()
      if (isModifierKey(e.key)) return // wait for a real key
      const combo = comboFromEvent(e)
      if (!combo) return // Cmd required
      setBinding(id, combo)
      persistence.save()
      stop()
      render()
    }
    window.addEventListener('keydown', handler, true)
  }

  render()
}
