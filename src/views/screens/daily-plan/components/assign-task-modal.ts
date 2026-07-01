import type { DailyPlanTask } from '@views/types/types'
import { AssignTaskModalController } from './assign-task-modal.controller'

export interface AssignTaskModalProps {
  paneId: string
  // Open the edit form for the just-assigned task (owned by the board, so it can
  // wire the board re-render).
  openTaskForm: (task: DailyPlanTask) => void
}

// Modal to assign (or change / clear) the daily task a terminal pane works on.
// Picking a task assigns it and opens the task form so its status can be updated.
export function assignPaneToTask(props: AssignTaskModalProps): void {
  new AssignTaskModalController(props).open()
}
