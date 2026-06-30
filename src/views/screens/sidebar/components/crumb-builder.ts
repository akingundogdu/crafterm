import { el } from '@views/lib/dom'
import type { Crumb } from '../sidebar.types'

export function buildCrumb(crumb: Crumb): HTMLElement {
  const dot = el('span', { class: 'crumb-dot' })
  if (crumb.color) dot.style.background = crumb.color
  return el('div', { class: 'tab-crumb' }, dot, el('span', { class: 'crumb-text' }, crumb.text))
}
