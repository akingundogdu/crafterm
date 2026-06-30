import { el } from '@views/lib/dom'

interface ProjectRowProps {
  label: string
  sub?: string
  active: boolean
  onClick: (split: boolean) => void
  onHover: () => void
}

export function projectRow({ label, sub, active, onClick, onHover }: ProjectRowProps): HTMLDivElement {
  const row = el(
    'div',
    {
      class: 'pick-row project-row' + (active ? ' active' : ''),
      onClick: (ev: MouseEvent) => onClick(ev.metaKey || ev.ctrlKey)
    },
    el('span', { class: 'picker-name' }, label),
    sub ? el('span', { class: 'project-sub' }, sub) : null
  )
  row.addEventListener('mouseenter', onHover)
  return row
}
