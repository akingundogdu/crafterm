import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { CalendarStore } from './popover.store'

// The footer row: a clear button and a today/now button (label depends on mode).
// Buttons call the store methods directly.
export default class PopoverFooter extends Component {
  declare props: { store: CalendarStore }

  template({ store }: this['props']) {
    return (
      <div class="datepicker-pop-foot">
        <button class="datepicker-pop-foot-btn" onClick={() => store.clear()}>
          {UITexts.Components.clear}
        </button>
        <button class="datepicker-pop-foot-btn datepicker-pop-foot-btn-accent" onClick={() => store.today()}>
          {store.mode === 'datetime' ? 'Now' : 'Today'}
        </button>
      </div>
    )
  }
}
