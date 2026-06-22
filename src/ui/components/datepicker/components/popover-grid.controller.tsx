import type { FieldModel, PopoverContext } from '../datepicker.types'
import { WEEKDAYS, MONTHS, buildMonthCells, makeMonthNav } from '../datepicker.state'
import { createPopoverCell } from './popover-cell'

export interface PopoverGrid {
  head: HTMLDivElement
  weekRow: HTMLDivElement
  grid: HTMLDivElement
  renderGrid: () => void
}

// Month/year header (prev/next nav) + weekday row + the 6x7 cell grid. Builds
// the header/week/grid nodes and exposes a `renderGrid` routine that repaints
// the grid from the live `ctx` view month/year. The nav buttons mutate `ctx`
// and re-render through it. `build()` returns the head/week/grid + renderGrid.
export class PopoverGridController {
  private readonly model: FieldModel
  private readonly ctx: PopoverContext

  private readonly monthLabel: HTMLSpanElement
  private readonly head: HTMLDivElement
  private readonly weekRow: HTMLDivElement
  private readonly grid: HTMLDivElement

  constructor(model: FieldModel, ctx: PopoverContext) {
    this.model = model
    this.ctx = ctx

    this.monthLabel = (<span class="datepicker-pop-month" />) as HTMLSpanElement
    const prev = (
      <button class="datepicker-pop-nav" onClick={makeMonthNav(-1, ctx)}>
        ‹
      </button>
    ) as HTMLButtonElement
    const next = (
      <button class="datepicker-pop-nav" onClick={makeMonthNav(1, ctx)}>
        ›
      </button>
    ) as HTMLButtonElement
    this.head = (
      <div class="datepicker-pop-head">
        {prev}
        {this.monthLabel}
        {next}
      </div>
    ) as HTMLDivElement

    this.weekRow = (
      <div class="datepicker-pop-week">{WEEKDAYS.map((w) => <span>{w}</span>)}</div>
    ) as HTMLDivElement

    this.grid = (<div class="datepicker-pop-grid" />) as HTMLDivElement
  }

  build(): PopoverGrid {
    return { head: this.head, weekRow: this.weekRow, grid: this.grid, renderGrid: this.renderGrid }
  }

  private renderGrid = (): void => {
    const { ctx, model } = this
    this.monthLabel.textContent = `${MONTHS[ctx.viewM - 1]} ${ctx.viewY}`
    this.grid.innerHTML = ''
    for (const cell of buildMonthCells(ctx.viewY, ctx.viewM)) {
      this.grid.appendChild(createPopoverCell(cell, model, ctx))
    }
  }
}
