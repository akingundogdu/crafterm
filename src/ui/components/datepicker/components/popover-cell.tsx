import type { DayCell, FieldModel, PopoverContext } from '../datepicker.types'
import { isSelectedCell, makeCellClick } from '../datepicker.state'

// One calendar day button: muted/today/selected classes + click handler.
export function createPopoverCell(cell: DayCell, model: FieldModel, ctx: PopoverContext): HTMLButtonElement {
  const el = (
    <button class="datepicker-pop-cell" onClick={makeCellClick(cell, ctx)}>
      {String(cell.d)}
    </button>
  ) as HTMLButtonElement
  if (cell.muted) el.classList.add('datepicker-pop-cell-muted')
  if (cell.today) el.classList.add('datepicker-pop-cell-today')
  if (isSelectedCell(model, cell)) el.classList.add('datepicker-pop-cell-selected')
  return el
}
