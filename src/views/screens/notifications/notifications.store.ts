import { Store } from '@geajs/core'
import type { AppNotification } from '@views/types/types'
import { notificationRepo } from '@repositories'
import { updateNotifBadge } from '@views/components/status-bar/components/notif-badge'

// Reactive state for the gea Notifications (Alerts) panel. notificationRepo stays
// the persisted source of truth; this store mirrors it into a reactive array so
// gea patches the card list on mutation, replacing the legacy renderNotifications()
// /replaceChildren cycle. Per-card expanded state is tracked in a reactive Record
// (gea reactivity is object/array, not Set) so toggling re-renders the card.
class NotificationsStore extends Store {
  items: AppNotification[] = []
  expanded: Record<string, boolean> = {}

  // Mirror the repo into the reactive array and push the unread count to the badge.
  reload(): void {
    this.items = [...notificationRepo.getAll()]
    updateNotifBadge(notificationRepo.getAll().length)
  }

  isExpanded(id: string): boolean {
    return !!this.expanded[id]
  }

  toggleExpanded(id: string): void {
    this.expanded = { ...this.expanded, [id]: !this.expanded[id] }
  }

  // Remove a notification, forget its expanded state, refresh the list + badge.
  dismiss(id: string): void {
    notificationRepo.remove(id)
    const next = { ...this.expanded }
    delete next[id]
    this.expanded = next
    this.reload()
  }

  clear(): void {
    notificationRepo.clear()
    this.expanded = {}
    this.reload()
  }
}

export default new NotificationsStore()
