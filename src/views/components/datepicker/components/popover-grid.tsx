import { Component } from '@geajs/core'
import { WEEKDAYS, MONTHS, buildMonthCells, isSelectedCell, stopMousedown } from '../datepicker.state'
import type { CalendarStore } from './popover.store'
import PopoverCell from './popover-cell'
import PopoverFooter from './popover-footer'
import PopoverTimeInput from './popover-time-input'

// Reactive body of the calendar popover: month/year header (prev/next nav) +
// weekday row + the 6x7 day grid, plus the optional time row (datetime mode) and
// the footer. Rendered as a JSX child of DatePopover so gea tracks its store reads
// (viewY / viewM / selected) and re-renders the whole `.datepicker-pop` in place on
// every month nav, day select and time change — the ssh SshList pattern. Its single
// root IS `.datepicker-pop`, so head/week/grid stay direct children (DOM-faithful).
export default class PopoverBody extends Component {
  declare props: { store: CalendarStore }

  template({ store }: this['props']) {
    const cells = buildMonthCells(store.viewY, store.viewM)
    const sel = store.selected
    return (
      <div class="datepicker-pop" onMouseDown={stopMousedown}>
        <div class="datepicker-pop-head">
          <button class="datepicker-pop-nav" onClick={() => store.navMonth(-1)}>
            ‹
          </button>
          <span class="datepicker-pop-month">{`${MONTHS[store.viewM - 1]} ${store.viewY}`}</span>
          <button class="datepicker-pop-nav" onClick={() => store.navMonth(1)}>
            ›
          </button>
        </div>
        <div class="datepicker-pop-week">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div class="datepicker-pop-grid">
          {cells.map((cell) => (
            <PopoverCell
              key={`${cell.y}-${cell.m}-${cell.d}`}
              cell={cell}
              isSelected={isSelectedCell({ selected: sel }, cell)}
              onPick={() => store.selectDay(cell)}
            />
          ))}
        </div>
        {store.mode === 'datetime' && <PopoverTimeInput store={store} />}
        <PopoverFooter store={store} />
      </div>
    )
  }
}
