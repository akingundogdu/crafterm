import { UITexts } from '@texts'
import './datepicker.css'
import type { DateFieldMode, DateField, FieldModel, PopoverContext } from './datepicker.types'
import {
  CAL_SVG,
  WEEKDAYS,
  MONTHS,
  parseValue,
  displayLabel,
  nowState,
  isSelectedCell,
  placeholderFor,
  timeValue,
  buildMonthCells,
  defineValueProp,
  dispatchChange,
  positionPopover,
  makeTriggerClick,
  stopMousedown,
  makeMonthNav,
  makeCellClick,
  makeTimeInput,
  makeClearClick,
  makeTodayClick,
  makeOutsideDown,
  makeEscapeKey
} from './datepicker.state'

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
  const text = (<span class="datepicker-field-text" />) as HTMLSpanElement
  const btn = (
    <button type="button" class={'datepicker-field' + (opts.className ? ` ${opts.className}` : '')}>
      {text}
      <span class="datepicker-field-glyph" innerHTML={CAL_SVG} />
    </button>
  ) as DateField

  const model: FieldModel = { selected: parseValue(mode, opts.value ?? '') }

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
  btn.addEventListener('click', makeTriggerClick(openPopover))

  // ---- Popover ---------------------------------------------------------
  function openPopover(): void {
    document.querySelector('.datepicker-pop')?.remove()

    const startView = model.selected ? { ...model.selected } : nowState(mode)

    const monthLabel = (<span class="datepicker-pop-month" />) as HTMLSpanElement
    const prev = (<button class="datepicker-pop-nav">‹</button>) as HTMLButtonElement
    const next = (<button class="datepicker-pop-nav">›</button>) as HTMLButtonElement
    const head = (
      <div class="datepicker-pop-head">
        {prev}
        {monthLabel}
        {next}
      </div>
    ) as HTMLDivElement

    const weekRow = (
      <div class="datepicker-pop-week">{WEEKDAYS.map((w) => <span>{w}</span>)}</div>
    ) as HTMLDivElement

    const grid = (<div class="datepicker-pop-grid" />) as HTMLDivElement

    const ctx: PopoverContext = {
      mode,
      model,
      viewY: startView.y,
      viewM: startView.m,
      timeInput: null,
      syncText,
      emitChange: () => dispatchChange(btn),
      renderGrid,
      close
    }

    function renderGrid(): void {
      monthLabel.textContent = `${MONTHS[ctx.viewM - 1]} ${ctx.viewY}`
      grid.innerHTML = ''
      for (const cell of buildMonthCells(ctx.viewY, ctx.viewM)) {
        const el = (<button class="datepicker-pop-cell">{String(cell.d)}</button>) as HTMLButtonElement
        if (cell.muted) el.classList.add('datepicker-pop-cell-muted')
        if (cell.today) el.classList.add('datepicker-pop-cell-today')
        if (isSelectedCell(model, cell)) el.classList.add('datepicker-pop-cell-selected')
        el.addEventListener('click', makeCellClick(cell, ctx))
        grid.appendChild(el)
      }
    }

    prev.addEventListener('click', makeMonthNav(-1, ctx))
    next.addEventListener('click', makeMonthNav(1, ctx))

    const pop = (<div class="datepicker-pop" />) as HTMLDivElement
    pop.addEventListener('mousedown', stopMousedown)
    pop.append(head, weekRow, grid)

    if (mode === 'datetime') {
      const timeInput = (<input type="time" class="datepicker-pop-time-input" />) as HTMLInputElement
      ctx.timeInput = timeInput
      timeInput.value = model.selected ? timeValue(model.selected) : ''
      timeInput.addEventListener('input', makeTimeInput(ctx, timeInput))
      const timeRow = (
        <div class="datepicker-pop-time">
          <span>{UITexts.Components.time}</span>
          {timeInput}
        </div>
      ) as HTMLDivElement
      pop.appendChild(timeRow)
    }

    const clearBtn = (
      <button class="datepicker-pop-foot-btn">{UITexts.Components.clear}</button>
    ) as HTMLButtonElement
    clearBtn.addEventListener('click', makeClearClick(ctx))
    const todayBtn = (
      <button class="datepicker-pop-foot-btn datepicker-pop-foot-btn-accent">
        {mode === 'datetime' ? 'Now' : 'Today'}
      </button>
    ) as HTMLButtonElement
    todayBtn.addEventListener('click', makeTodayClick(ctx))
    const foot = (
      <div class="datepicker-pop-foot">
        {clearBtn}
        {todayBtn}
      </div>
    ) as HTMLDivElement
    pop.appendChild(foot)

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
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey, true)
  }

  return btn
}
