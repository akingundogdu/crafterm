import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import { timeValue } from '../datepicker.store'
import type { CalendarStore } from './popover.store'

// The datetime-mode time row. The input is controlled off the reactive selection
// (so a day-select / Now updates it), and typing writes the time back through the
// store.
export default class PopoverTimeInput extends Component {
  declare props: { store: CalendarStore }

  template({ store }: this['props']) {
    return (
      <div class="datepicker-pop-time">
        <span>{UITexts.Components.time}</span>
        <input
          type="time"
          class="datepicker-pop-time-input"
          value={store.selected ? timeValue(store.selected) : ''}
          onInput={(e: Event) => store.setTimeFromInput((e.target as HTMLInputElement).value)}
        />
      </div>
    )
  }
}
