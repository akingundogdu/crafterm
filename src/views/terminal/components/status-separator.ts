import { el } from '@views/lib/dom'

// Middle-dot separator placed between adjacent status segments.
export function createStatusSeparator(): HTMLSpanElement {
  return el('span', { class: 'pane-status-sep' }, '·')
}
