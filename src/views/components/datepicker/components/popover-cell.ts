import { el } from '@views/lib/dom'
import type { DayCell, FieldModel, PopoverContext } from '../datepicker.types'
import { isSelectedCell, makeCellClick } from '../datepicker.state'

// One calendar day button: muted/today/selected classes + click handler.
export function createPopoverCell(cell: DayCell, model: FieldModel, ctx: PopoverContext): HTMLButtonElement {
  const node = el('button', { class: 'datepicker-pop-cell', onClick: makeCellClick(cell, ctx) }, String(cell.d))
  if (cell.muted) node.classList.add('datepicker-pop-cell-muted')
  if (cell.today) node.classList.add('datepicker-pop-cell-today')
  if (isSelectedCell(model, cell)) node.classList.add('datepicker-pop-cell-selected')
  return node
}
