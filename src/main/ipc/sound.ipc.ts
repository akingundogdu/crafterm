import { ipcMain } from 'electron'
import { existsSync } from 'fs'
import { execFile } from 'child_process'
import { join } from 'path'
import { soundsDir } from '../services/paths'

// Bundled, per-event notification sounds. 'question' plays when a pane wants
// attention (e.g. Claude asks something), 'done' when a long command finishes.
const EVENT_SOUNDS: Record<string, string> = {
  question: 'question.wav',
  done: 'notification.aac'
}

// Sound bridge (sound:*): play macOS system sounds + bundled event sounds.
export function registerSoundIpc(): void {
  // Play a macOS system sound by name (e.g. "Glass") for notifications.
  ipcMain.on('sound:play', (_e, { name }: { name: string }) => {
    if (!name) return
    const p = `/System/Library/Sounds/${name}.aiff`
    if (existsSync(p)) execFile('/usr/bin/afplay', [p], () => {})
  })
  ipcMain.on('sound:event', (_e, { event }: { event: string }) => {
    const file = EVENT_SOUNDS[event]
    if (!file) return
    const p = join(soundsDir(), file)
    if (existsSync(p)) execFile('/usr/bin/afplay', [p], () => {})
  })
}
