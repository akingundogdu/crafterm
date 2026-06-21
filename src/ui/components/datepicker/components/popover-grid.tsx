import type { FieldModel, PopoverContext } from '../datepicker.types'
import { WEEKDAYS, MONTHS, buildMonthCells, makeMonthNav } from '../datepicker.state'
import { createPopoverCell } from './popover-cell'

// Month/year header (prev/next nav) + weekday row + the 6x7 cell grid.
// Returns the header/week/grid nodes plus a `renderGrid` routine that repaints
// the grid from the live `ctx` view month/year. The nav buttons mutate `ctx`
// and re-render through it.
export function createPopoverGrid(
  model: FieldModel,
  ctx: PopoverContext
): { head: HTMLDivElement; weekRow: HTMLDivElement; grid: HTMLDivElement; renderGrid: () => void } {
  const monthLabel = (<span class="datepicker-pop-month" />) as HTMLSpanElement
  const prev = (<button class="datepicker-pop-nav">‹</button>) as HTMLButtonElement
  const next = (<button class="datepicker-pop-nav">›</button>) as HTMLButtonElement
  const head = (
    <div class="datepicker-pop-head">
      {prev}
      {monthLabel}
      {next}
    </div>
  ) as HTMLDivElement

  const weekRow = (
    <div class="datepicker-pop-week">{WEEKDAYS.map((w) => <span>{w}</span>)}</div>
  ) as HTMLDivElement

  const grid = (<div class="datepicker-pop-grid" />) as HTMLDivElement

  function renderGrid(): void {
    monthLabel.textContent = `${MONTHS[ctx.viewM - 1]} ${ctx.viewY}`
    grid.innerHTML = ''
    for (const cell of buildMonthCells(ctx.viewY, ctx.viewM)) {
      grid.appendChild(createPopoverCell(cell, model, ctx))
    }
  }

  prev.addEventListener('click', makeMonthNav(-1, ctx))
  next.addEventListener('click', makeMonthNav(1, ctx))

  return { head, weekRow, grid, renderGrid }
}
