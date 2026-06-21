import { UITexts } from '@texts'
import type { PopoverContext } from '../datepicker.types'
import { makeClearClick, makeTodayClick } from '../datepicker.state'

// The footer row: a clear button and a today/now button (label depends on mode).
export function createPopoverFooter(ctx: PopoverContext): HTMLDivElement {
  const clearBtn = (
    <button class="datepicker-pop-foot-btn">{UITexts.Components.clear}</button>
  ) as HTMLButtonElement
  clearBtn.addEventListener('click', makeClearClick(ctx))
  const todayBtn = (
    <button class="datepicker-pop-foot-btn datepicker-pop-foot-btn-accent">
      {ctx.mode === 'datetime' ? 'Now' : 'Today'}
    </button>
  ) as HTMLButtonElement
  todayBtn.addEventListener('click', makeTodayClick(ctx))
  return (
    <div class="datepicker-pop-foot">
      {clearBtn}
      {todayBtn}
    </div>
  ) as HTMLDivElement
}
