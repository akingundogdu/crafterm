// Sound bridge types (sound:* channels: macOS system sounds + bundled events).
export interface SoundPlayRequest {
  name: string
}

export interface SoundEventRequest {
  event: 'question' | 'done'
}
