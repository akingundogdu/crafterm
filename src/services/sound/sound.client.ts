import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// Sound IPC (sound:*): play macOS system sounds + bundled per-event sounds.
class SoundClient extends BaseClient {
  play = (name: string) => this.send(Channel.Sound.Play, { name })
  playEvent = (event: 'question' | 'done') => this.send(Channel.Sound.Event, { event })
}

export const soundService = new SoundClient()
