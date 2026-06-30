import { el } from '@views/lib/dom'
import type { DirEntry } from '@services/fs/fs.types'
import { planTitle } from '../plans.state'

interface PlansListProps {
  container: HTMLDivElement
  items: DirEntry[]
  selected: number
  onChoose: (plan: DirEntry) => void
  onHover: (index: number) => void
}

export function renderPlansList({
  container,
  items,
  selected,
  onChoose,
  onHover
}: PlansListProps): void {
  container.replaceChildren()
  if (!items.length) {
    container.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
    return
  }
  items.forEach((p, i) => {
    const row = el(
      'button',
      { class: 'pick-row' + (i === selected ? ' active' : ''), onClick: () => onChoose(p) },
      planTitle(p)
    )
    row.addEventListener('mouseenter', () => onHover(i))
    container.appendChild(row)
  })
}
