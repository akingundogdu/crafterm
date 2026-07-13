import type { NotifGroup } from '../notifications.types'
import { CHEVRON_SVG } from '../notifications.store'

// A collapsed terminal group's card. The chevron is the same one the single cards
// use — re-exported so the view has one import.
export { CHEVRON_SVG }

// "3 alerts" / "1 alert" — the count badge on the group head.
export function groupCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'alert' : 'alerts'}`
}

// The line under the group title: the newest message, so the collapsed card still
// says what happened without expanding it.
export function groupSummary(group: NotifGroup): string {
  return group.items.reduce((a, b) => (b.time > a.time ? b : a)).message
}
