import { KEYBINDINGS } from '@ui/keybindings/keybindings'
import { makeResetBinding } from '../shortcuts.state'
import { buildShortcutRow } from './shortcut-row'

interface ShortcutsListProps {
  list: HTMLDivElement
  recordingId: string | null
  render: () => void
  onStartRecording: (id: string) => void
}

// Render every keybinding row into the list, reflecting the current recording id.
export function renderShortcutsList(props: ShortcutsListProps): void {
  const { list, recordingId, render, onStartRecording } = props
  list.replaceChildren()
  KEYBINDINGS.forEach((a) => {
    const row = buildShortcutRow({
      id: a.id,
      label: a.label,
      isRecording: recordingId === a.id,
      onStartRecording,
      onReset: makeResetBinding(a.id, render)
    })
    list.appendChild(row)
  })
}
