import { UITexts } from '@texts'
import type { PopoverContext } from '../datepicker.types'
import { timeValue, makeTimeInput } from '../datepicker.state'

// The datetime-mode time row. Seeds the input from the current selection,
// registers the input handler on `ctx`, and returns the row to append.
export function createPopoverTimeInput(ctx: PopoverContext): HTMLDivElement {
  const timeInput = (<input type="time" class="datepicker-pop-time-input" />) as HTMLInputElement
  ctx.timeInput = timeInput
  timeInput.value = ctx.model.selected ? timeValue(ctx.model.selected) : ''
  timeInput.addEventListener('input', makeTimeInput(ctx, timeInput))
  return (
    <div class="datepicker-pop-time">
      <span>{UITexts.Components.time}</span>
      {timeInput}
    </div>
  ) as HTMLDivElement
}
