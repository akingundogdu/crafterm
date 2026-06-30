import { el } from '@views/lib/dom'
import { INDENT } from '../treeview.state'

// Depth guide lines for a row: vertical ancestor lines + the elbow into this
// node. Pure presentation — takes plain args, no closure state.
export function buildGuides(depth: number, guides: boolean[], isLast: boolean): HTMLElement | null {
  if (depth === 0) return null
  const x = (level: number): number => 10 + level * INDENT + 7
  const lines: HTMLElement[] = []
  for (let level = 0; level < depth - 1; level++) {
    if (!guides[level]) continue
    const line = el('span', { class: 'guide-line' })
    line.style.left = x(level) + 'px'
    lines.push(line)
  }
  const elbow = el('span', { class: 'guide-elbow' + (isLast ? ' last' : '') })
  elbow.style.left = x(depth - 1) + 'px'
  return el('div', { class: 'row-guides' }, ...lines, elbow)
}
