import { settings } from '../../../state'
import { persistence } from '@services/storage/persistence.service'
import {
  KEYBINDINGS,
  effectiveCombo,
  comboLabel,
  comboFromEvent,
  setBinding,
  resetBinding,
  setRecording,
  isModifierKey
} from '../../../keybindings'
import { settingsCleanups } from '../shared'

export function buildShortcutsPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Shortcuts</h3>')
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Click a shortcut, then press the new key combo (Cmd required). Esc cancels.</div>'
  )
  const list = document.createElement('div')
  list.className = 'shortcuts-list'
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
      const row = document.createElement('div')
      row.className = 'shortcut-row'
      const label = document.createElement('span')
      label.className = 'shortcut-label'
      label.textContent = a.label
      const combo = document.createElement('button')
      combo.className = 'shortcut-combo' + (recordingId === a.id ? ' recording' : '')
      combo.textContent = recordingId === a.id ? 'Press keys…' : comboLabel(effectiveCombo(a.id))
      combo.addEventListener('click', () => startRecording(a.id))
      const reset = document.createElement('button')
      reset.className = 'shortcut-reset'
      reset.textContent = '↺'
      reset.title = 'Reset to default'
      if (!settings.bindings[a.id]) reset.style.visibility = 'hidden'
      reset.addEventListener('click', () => {
        resetBinding(a.id)
        persistence.save()
        render()
      })
      row.append(label, combo, reset)
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

