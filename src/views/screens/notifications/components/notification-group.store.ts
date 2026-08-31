import type { NotifGroup } from '../notifications.types'
import store, { CHEVRON_SVG } from '../notifications.store'
import { panes, poppedOut } from '@views/state/spine'
import { selectPane } from '@views/commands/commands'
import { terminalService } from '@services'

// A collapsed terminal group's card. The chevron is the same one the single cards
// use — re-exported so the view has one import.
export { CHEVRON_SVG }

export const GONE_TITLE = 'This terminal is gone'

// "3 alerts" / "1 alert" — the count badge on the group head.
export function groupCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'alert' : 'alerts'}`
}

// Jump to the group's terminal and clear it — exactly what clicking a single card
// does. The group used to only expand, so a terminal with more than one alert could
// not be reached from the panel at all (todomr5sckyaei); it also stayed in the list
// after the jump, unlike every other card.
export function goToGroup(group: NotifGroup): void {
  const paneId = group.paneId
  if (!paneId) return
  if (poppedOut.has(paneId)) terminalService.popoutFocus(paneId)
  else if (panes.has(paneId)) selectPane(paneId)
  store.dismissGroup(group)
}
