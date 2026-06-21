import type { DateField, DateFieldMode, FieldModel } from '../datepicker.types'
import {
  CAL_SVG,
  parseValue,
  displayLabel,
  placeholderFor,
  defineValueProp,
  makeTriggerClick
} from '../datepicker.state'

// The trigger button: a label span + calendar glyph, a native-like `value`
// property, and a click that opens the popover. Owns the selection model and
// label sync; returns both so the shell can hand them to the popover.
export function createDateFieldTrigger(
  mode: DateFieldMode,
  value: string,
  className: string | undefined,
  openPopover: (btn: DateField, model: FieldModel, syncText: () => void) => void
): { btn: DateField; model: FieldModel; syncText: () => void } {
  const text = (<span class="datepicker-field-text" />) as HTMLSpanElement
  const btn = (
    <button type="button" class={'datepicker-field' + (className ? ` ${className}` : '')}>
      {text}
      <span class="datepicker-field-glyph" innerHTML={CAL_SVG} />
    </button>
  ) as DateField

  const model: FieldModel = { selected: parseValue(mode, value) }

  const placeholder = placeholderFor(mode)
  const syncText = (): void => {
    if (model.selected) {
      text.textContent = displayLabel(mode, model.selected)
      text.classList.remove('datepicker-field-empty')
    } else {
      text.textContent = placeholder
      text.classList.add('datepicker-field-empty')
    }
  }
  syncText()

  defineValueProp(btn, mode, model, syncText)
  btn.addEventListener('click', makeTriggerClick(() => openPopover(btn, model, syncText)))

  return { btn, model, syncText }
}
