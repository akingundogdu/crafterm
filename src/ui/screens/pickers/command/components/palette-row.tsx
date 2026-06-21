import type { PaletteCommand } from '../command.types'

interface PaletteRowProps {
  command: PaletteCommand
  active: boolean
  onClick: () => void
  onHover: () => void
}

export function paletteRow({ command, active, onClick, onHover }: PaletteRowProps): HTMLDivElement {
  const name = (<span class="palette-name">{command.name}</span>) as HTMLSpanElement
  const tag = (<span class="palette-cat">{command.category}</span>) as HTMLSpanElement
  const row = (
    <div class={'pick-row palette-row' + (active ? ' active' : '')}>
      {name}
      {command.value && command.value !== command.name && (
        <span class="palette-val">{command.value}</span>
      )}
      {tag}
    </div>
  ) as HTMLDivElement
  row.addEventListener('click', onClick)
  row.addEventListener('mouseenter', onHover)
  return row
}
