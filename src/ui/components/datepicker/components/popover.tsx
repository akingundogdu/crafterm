import type { DateField, DateFieldMode, FieldModel, PopoverContext } from '../datepicker.types'
import {
  nowState,
  dispatchChange,
  positionPopover,
  stopMousedown,
  makeOutsideDown,
  makeEscapeKey
} from '../datepicker.state'
import { createPopoverGrid } from './popover-grid'
import { createPopoverTimeInput } from './popover-time-input'
import { createPopoverFooter } from './popover-footer'

// Opens the calendar popover anchored to the trigger. Owns the popover lifecycle:
// builds the shared `ctx`, assembles the grid/time/footer parts, mounts + positions
// the container, and wires the outside-click + escape teardown via `close`.
export function openPopover(
  mode: DateFieldMode,
  model: FieldModel,
  btn: DateField,
  syncText: () => void
): void {
  document.querySelector('.datepicker-pop')?.remove()

  const startView = model.selected ? { ...model.selected } : nowState(mode)

  const ctx: PopoverContext = {
    mode,
    model,
    viewY: startView.y,
    viewM: startView.m,
    timeInput: null,
    syncText,
    emitChange: () => dispatchChange(btn),
    renderGrid: () => {},
    close: () => {}
  }

  const { head, weekRow, grid, renderGrid } = createPopoverGrid(model, ctx)
  ctx.renderGrid = renderGrid

  const pop = (<div class="datepicker-pop" onMouseDown={stopMousedown} />) as HTMLDivElement
  pop.append(head, weekRow, grid)

  if (mode === 'datetime') {
    pop.appendChild(createPopoverTimeInput(ctx))
  }

  pop.appendChild(createPopoverFooter(ctx))

  renderGrid()
  document.body.appendChild(pop)
  positionPopover(pop, btn)

  const onDown = makeOutsideDown(pop, btn, close)
  const onKey = makeEscapeKey(close)
  function close(): void {
    document.removeEventListener('mousedown', onDown, true)
    document.removeEventListener('keydown', onKey, true)
    pop.remove()
  }
  ctx.close = close
  document.addEventListener('mousedown', onDown, true)
  document.addEventListener('keydown', onKey, true)
}
