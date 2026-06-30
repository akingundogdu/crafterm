import type { DailyPlanTask, DailyPlanStatus } from '@views/types/types'
import { createOverlay } from '@views/components/overlay/overlay'
import store from './task-form.store'
import TaskForm from './task-form'

export interface TaskFormProps {
  existing: DailyPlanTask | null
  onSaved: () => void
  defaultStatus?: DailyPlanStatus
  // The board's selected day; defaults new tasks' date and the unset-date fallback.
  // A getter so the form reads the live value at open time.
  getSelectedDate: () => string
  // Open a Claude terminal seeded with this task (owned by the board).
  openTaskInTerminal: (task: DailyPlanTask, onChange: () => void, useWorktree?: boolean) => void
}

// Opens the gea create/edit task form: a @views overlay backdrop (with the
// daily-plan-form sizing class) and the gea TaskForm body mounted inside, focusing
// the title input. Self-contained — no @ui (§2.7).
export function openTaskForm({ existing, onSaved, defaultStatus = 'todo', getSelectedDate, openTaskInTerminal }: TaskFormProps): void {
  const ov = createOverlay()
  ov.overlay.classList.add('daily-plan-form-overlay')
  store.open(existing, defaultStatus, getSelectedDate(), onSaved, openTaskInTerminal, () => ov.close())
  new TaskForm().render(ov.overlay)
  ov.mount()
  const title = ov.overlay.querySelector('.daily-plan-title-input') as HTMLTextAreaElement | null
  title?.focus()
  title?.select()
}
