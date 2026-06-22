import type { FieldModel, PopoverContext } from '../datepicker.types'
import { PopoverGridController } from './popover-grid.controller'

// Month/year header (prev/next nav) + weekday row + the 6x7 cell grid.
// Returns the header/week/grid nodes plus a `renderGrid` routine that repaints
// the grid from the live `ctx` view month/year. The nav buttons mutate `ctx`
// and re-render through it.
export function createPopoverGrid(
  model: FieldModel,
  ctx: PopoverContext
): { head: HTMLDivElement; weekRow: HTMLDivElement; grid: HTMLDivElement; renderGrid: () => void } {
  return new PopoverGridController(model, ctx).build()
}
