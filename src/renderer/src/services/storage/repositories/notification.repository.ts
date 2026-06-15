import type { AppNotification } from '../../../types'
import { notifications } from '../../../state'

// Notification repository over the live `notifications` singleton. Notifications
// are an in-memory, capped (newest-first, max 100) collection; they are NOT
// persisted on mutation — the last 24h / 50 entries are windowed into the state
// blob only when the whole state is saved (serializeNotifications). So this repo
// intentionally has no persist side effect, mirroring the previous behavior.

const RUNTIME_CAP = 100

export const notificationRepo = {
  getAll(): AppNotification[] {
    return notifications
  },
  get(id: string): AppNotification | undefined {
    return notifications.find((n) => n.id === id)
  },
  query(pred: (n: AppNotification) => boolean): AppNotification[] {
    return notifications.filter(pred)
  },
  // Add newest-first and trim to the runtime cap.
  add(n: AppNotification): void {
    notifications.unshift(n)
    if (notifications.length > RUNTIME_CAP) notifications.length = RUNTIME_CAP
  },
  remove(id: string): void {
    const i = notifications.findIndex((n) => n.id === id)
    if (i >= 0) notifications.splice(i, 1)
  },
  clear(): void {
    notifications.length = 0
  }
}
