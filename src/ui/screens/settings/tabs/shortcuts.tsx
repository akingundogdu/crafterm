import { UITexts } from '@texts'
import { renderShortcutsList } from './components/shortcuts-list'
import { createRecordingHandler } from './components/recording-handler'

export function buildShortcutsPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.shortcuts.heading}</h3>`)
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Click a shortcut, then press the new key combo (Cmd required). Esc cancels.</div>'
  )
  const list = (<div class="shortcuts-list" />) as HTMLDivElement
  panel.appendChild(list)

  const render = (): void => {
    renderShortcutsList({
      list,
      recordingId: recording.getRecordingId(),
      render,
      onStartRecording: (id) => recording.start(id)
    })
  }

  const recording = createRecordingHandler({ render })

  render()
}
