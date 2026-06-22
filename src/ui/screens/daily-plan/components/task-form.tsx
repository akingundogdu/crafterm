import type { DailyPlanTask, DailyPlanStatus } from '@ui/types/types'
import { TaskFormController } from './task-form.controller'

export interface TaskFormProps {
  existing: DailyPlanTask | null
  onSaved: () => void
  defaultStatus?: DailyPlanStatus
  // The board's selected day; defaults new tasks' date and the unset-date
  // fallback. A getter so the form reads the live value at open time.
  getSelectedDate: () => string
  // Open a Claude terminal seeded with this task (owned by the board).
  openTaskInTerminal: (task: DailyPlanTask, onChange: () => void, useWorktree?: boolean) => void
}

// The create / edit task modal: title, description, tags, project, status,
// priority, date, due date, worktree slug — plus Save / Remind / Run actions.
export function showTaskForm(props: TaskFormProps): void {
  new TaskFormController(props).open()
}
