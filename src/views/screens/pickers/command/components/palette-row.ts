import { el } from '@views/lib/dom'
import type { PaletteCommand } from '../command.types'

interface PaletteRowProps {
  command: PaletteCommand
  active: boolean
  onClick: () => void
  onHover: () => void
}

export function paletteRow({ command, active, onClick, onHover }: PaletteRowProps): HTMLDivElement {
  const name = el('span', { class: 'palette-name' }, command.name)
  const tag = el('span', { class: 'palette-cat' }, command.category)
  const row = el(
    'div',
    { class: 'pick-row palette-row' + (active ? ' active' : ''), onClick },
    name,
    command.value && command.value !== command.name
      ? el('span', { class: 'palette-val' }, command.value)
      : null,
    tag
  )
  row.addEventListener('mouseenter', onHover)
  return row
}
