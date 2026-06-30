import { ActionMenuRowController, type ActionMenuRowProps } from './action-menu-row.controller'

// One action-menu admin row: reorder (up/down) + visibility + edit + delete
// controls alongside the item's title and a descriptive subtitle.
export function buildActionMenuRow(props: ActionMenuRowProps): HTMLDivElement {
  return new ActionMenuRowController(props).render()
}
