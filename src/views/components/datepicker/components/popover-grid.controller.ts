import { el } from '@views/lib/dom'
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
// the head/week/grid nodes and exposes a `renderGrid` routine that repaints the
// grid from the live `ctx` view month/year. The nav buttons mutate `ctx` and
// re-render through it.
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

    this.monthLabel = el('span', { class: 'datepicker-pop-month' })
    const prev = el('button', { class: 'datepicker-pop-nav', onClick: makeMonthNav(-1, ctx) }, '‹')
    const next = el('button', { class: 'datepicker-pop-nav', onClick: makeMonthNav(1, ctx) }, '›')
    this.head = el('div', { class: 'datepicker-pop-head' }, prev, this.monthLabel, next)

    this.weekRow = el('div', { class: 'datepicker-pop-week' }, ...WEEKDAYS.map((w) => el('span', null, w)))

    this.grid = el('div', { class: 'datepicker-pop-grid' })
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
