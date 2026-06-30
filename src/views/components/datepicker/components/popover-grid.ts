import type { FieldModel, PopoverContext } from '../datepicker.types'
import { PopoverGridController, type PopoverGrid } from './popover-grid.controller'

// Month/year header (prev/next nav) + weekday row + the 6x7 cell grid. Returns
// the head/week/grid nodes plus a `renderGrid` routine that repaints the grid
// from the live `ctx` view month/year.
export function createPopoverGrid(model: FieldModel, ctx: PopoverContext): PopoverGrid {
  return new PopoverGridController(model, ctx).build()
}
