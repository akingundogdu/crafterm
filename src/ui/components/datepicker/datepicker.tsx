import './datepicker.css'
import type { DateFieldMode, DateField } from './datepicker.types'
import { createDateFieldTrigger } from './components/date-field-trigger'
import { openPopover } from './components/popover'

export type { DateFieldMode, DateField } from './datepicker.types'

// A themed, dependency-free replacement for native <input type="date"> and
// <input type="datetime-local">. The native calendar popup can't be styled to
// match the app, so this renders the field as a trigger button and a custom
// popover calendar. The returned element mimics the native input API: a `value`
// property (get/set) in the same string format and a `change` event on user
// selection, so existing call sites stay drop-in.
export function createDateField(opts: {
  mode: DateFieldMode
  value?: string
  className?: string
}): DateField {
  const { mode } = opts
  const { btn } = createDateFieldTrigger(mode, opts.value ?? '', opts.className, (b, model, syncText) =>
    openPopover(mode, model, b, syncText)
  )
  return btn
}
