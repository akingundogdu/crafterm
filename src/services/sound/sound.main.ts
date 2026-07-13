import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { existsSync } from 'fs'
import { execFile } from 'child_process'
import { join } from 'path'
import { soundsDir } from '@core/services/paths/paths.service'
import { BIN } from '@core/services/exec/exec.types'

// Bundled, per-event notification sounds. 'question' plays when a pane wants
// attention (e.g. Claude asks something), 'done' when a long command finishes.
const EVENT_SOUNDS: Record<string, string> = {
  question: 'question.wav',
  done: 'notification.aac'
}

// Sound IPC adapter (sound:*): play macOS system sounds + bundled event sounds.
export class SoundController extends BaseService {
  readonly name = 'sound'

  register(): void {
    // Play a macOS system sound by name (e.g. "Glass") for notifications.
    this.on(Channel.Sound.Play, ({ name }) => {
      if (!name) return
      const p = `/System/Library/Sounds/${name}.aiff`
      if (existsSync(p)) execFile(BIN.afplay, [p], () => {})
    })
    this.on(Channel.Sound.Event, ({ event }) => {
      const file = EVENT_SOUNDS[event]
      if (!file) return
      const p = join(soundsDir(), file)
      if (existsSync(p)) execFile(BIN.afplay, [p], () => {})
    })
  }
}

