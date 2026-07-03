import { Component } from '@geajs/core'
import type { DateField, DateFieldMode, FieldModel } from '../datepicker.types'
import {
  CAL_SVG,
  parseValue,
  displayLabel,
  placeholderFor,
  defineValueProp,
  makeTriggerClick
} from '../datepicker.state'
import { openPopover } from './popover'

// The trigger button: a label span + calendar glyph, a native-like `value`
// property (get/set), and a click that opens the anchored popover. Owns the
// selection model + label sync. The initial label is rendered in template() (no
// mount flicker); the SVG glyph and the `value` property are wired in
// onAfterRender (property ref + defineProperty — §5.11). Never re-renders (reads
// no reactive source), so the calendar's live state lives in the popover's store.
export default class DateFieldTrigger extends Component {
  btnEl: HTMLButtonElement | null = null
  textEl: HTMLSpanElement | null = null
  glyphEl: HTMLSpanElement | null = null

  private readonly mode: DateFieldMode
  private readonly className?: string
  private readonly placeholder: string
  private readonly model: FieldModel
  private valueBound = false

  constructor(opts: { mode: DateFieldMode; value: string; className?: string }) {
    super()
    this.mode = opts.mode
    this.className = opts.className
    this.placeholder = placeholderFor(opts.mode)
    this.model = { selected: parseValue(opts.mode, opts.value) }
  }

  private syncText = (): void => {
    if (!this.textEl) return
    if (this.model.selected) {
      this.textEl.textContent = displayLabel(this.mode, this.model.selected)
      this.textEl.classList.remove('datepicker-field-empty')
    } else {
      this.textEl.textContent = this.placeholder
      this.textEl.classList.add('datepicker-field-empty')
    }
  }

  private open = (): void => {
    if (this.btnEl) openPopover(this.mode, this.model, this.btnEl as DateField, this.syncText)
  }

  onAfterRender(): void {
    if (this.glyphEl && !this.glyphEl.firstChild) this.glyphEl.innerHTML = CAL_SVG
    if (this.btnEl && !this.valueBound) {
      defineValueProp(this.btnEl as DateField, this.mode, this.model, this.syncText)
      this.valueBound = true
    }
  }

  template() {
    const cls = 'datepicker-field' + (this.className ? ` ${this.className}` : '')
    const sel = this.model.selected
    const label = sel ? displayLabel(this.mode, sel) : this.placeholder
    const textCls = 'datepicker-field-text' + (sel ? '' : ' datepicker-field-empty')
    return (
      <button type="button" class={cls} onClick={makeTriggerClick(this.open)} ref={this.btnEl}>
        <span class={textCls} ref={this.textEl}>
          {label}
        </span>
        <span class="datepicker-field-glyph" ref={this.glyphEl} />
      </button>
    )
  }
}

// A themed, dependency-free replacement for native <input type="date"> and
// <input type="datetime-local">. Returns the trigger button, which mimics the
// native input API: a `value` property (get/set) in the stored string format and a
// `change` event on user selection, so call sites embed it and read `.value`.
// Mounts the gea Component into a throwaway host and hands back its root — the
// @views jsx-runtime binds real listeners, so the returned node keeps its click
// handler (the ios-worktree factory pattern).
export function createDateField(opts: { mode: DateFieldMode; value?: string; className?: string }): DateField {
  const host = document.createElement('div')
  new DateFieldTrigger({ mode: opts.mode, value: opts.value ?? '', className: opts.className }).render(host)
  return host.firstElementChild as DateField
}
