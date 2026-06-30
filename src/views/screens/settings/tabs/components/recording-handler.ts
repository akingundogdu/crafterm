import { setRecording } from '../../keybindings'
import { settingsCleanups } from '../../shared'
import { applyRecordedKey } from '../shortcuts.state'

interface RecordingHandler {
  start: (id: string) => void
  getRecordingId: () => string | null
}

interface RecordingHandlerProps {
  // Re-render the list after recording state changes. Reads getRecordingId().
  render: () => void
}

// Key-capture state machine for the shortcuts panel. Owns the in-flight
// recording id + keydown listener; registers a cleanup so capture stops if the
// settings modal closes mid-record.
export function createRecordingHandler(props: RecordingHandlerProps): RecordingHandler {
  const { render } = props
  let recordingId: string | null = null
  let handler: ((e: KeyboardEvent) => void) | null = null

  const stop = (): void => {
    if (handler) window.removeEventListener('keydown', handler, true)
    handler = null
    recordingId = null
    setRecording(false)
  }
  settingsCleanups.push(stop) // stop recording if the modal is closed mid-capture

  const start = (id: string): void => {
    stop()
    recordingId = id
    setRecording(true)
    render()
    handler = (e: KeyboardEvent): void => {
      if (applyRecordedKey(id, e) === 'ignore') return
      stop()
      render()
    }
    window.addEventListener('keydown', handler, true)
  }

  return { start, getRecordingId: () => recordingId }
}
