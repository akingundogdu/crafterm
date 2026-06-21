import { UITexts } from '@texts'
import type { PopoverContext } from '../datepicker.types'
import { makeClearClick, makeTodayClick } from '../datepicker.state'

// The footer row: a clear button and a today/now button (label depends on mode).
export function createPopoverFooter(ctx: PopoverContext): HTMLDivElement {
  const clearBtn = (
    <button class="datepicker-pop-foot-btn" onClick={makeClearClick(ctx)}>
      {UITexts.Components.clear}
    </button>
  ) as HTMLButtonElement
  const todayBtn = (
    <button
      class="datepicker-pop-foot-btn datepicker-pop-foot-btn-accent"
      onClick={makeTodayClick(ctx)}
    >
      {ctx.mode === 'datetime' ? 'Now' : 'Today'}
    </button>
  ) as HTMLButtonElement
  return (
    <div class="datepicker-pop-foot">
      {clearBtn}
      {todayBtn}
    </div>
  ) as HTMLDivElement
}
