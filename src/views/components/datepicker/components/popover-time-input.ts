import { el } from '@views/lib/dom'
import { UITexts } from '@texts'
import type { PopoverContext } from '../datepicker.types'
import { timeValue, makeTimeInput } from '../datepicker.state'

// The datetime-mode time row. Seeds the input from the current selection,
// registers the input handler on `ctx`, and returns the row to append.
export function createPopoverTimeInput(ctx: PopoverContext): HTMLDivElement {
  const timeInput = el('input', { type: 'time', class: 'datepicker-pop-time-input' })
  ctx.timeInput = timeInput
  timeInput.value = ctx.model.selected ? timeValue(ctx.model.selected) : ''
  timeInput.addEventListener('input', makeTimeInput(ctx, timeInput))
  return el('div', { class: 'datepicker-pop-time' }, el('span', null, UITexts.Components.time), timeInput)
}
