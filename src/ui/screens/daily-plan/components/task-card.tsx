import type { DailyPlanTask } from '@ui/types/types'
import { TaskCardController } from './task-card.controller'

export interface TaskCardProps {
  task: DailyPlanTask
  rerender: () => void
  // The current board scope; drives the per-card day label in multi-day views.
  // A getter so the card reads the live value at build time.
  getSelectedRange: () => 'day' | '3d' | '7d'
  // Open a Claude terminal seeded with this task (owned by the board).
  openTaskInTerminal: (task: DailyPlanTask, onChange: () => void, useWorktree?: boolean) => void
  // Open the create/edit task form for this task (owned by the board).
  showTaskForm: (existing: DailyPlanTask, onSaved: () => void) => void
}

// Draggable task card: priority dot, branch/issue chip, review/test badge, action
// icons (run / remind / edit / delete), due-date + day labels, description, tags.
// Business actions are injected so the card stays a pure DOM factory.
export function renderCard(props: TaskCardProps): HTMLElement {
  return new TaskCardController(props).render()
}
