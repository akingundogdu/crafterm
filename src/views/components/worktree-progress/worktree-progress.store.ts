import { Store } from '@geajs/core'
import type { WorktreeStage } from '@services/worktrees'

// Progress for "run this ticket in a worktree" (todomr4q102cd9). The work used to
// happen silently after the modal closed, so a failure — a branch already checked
// out, a missing base — looked like nothing happening at all. This store drives a
// small overlay that names each step, and on failure keeps it open with git's own
// error instead of quietly giving up.

// A step is just an id + a label; each flow supplies its own list.
export interface ProgressStep {
  id: string
  label: string
}

// Creating a worktree. 'opening' is the caller's own last step (start the terminal
// in the worktree); the service reports the ones before it.
export const CREATE_STEPS: ProgressStep[] = [
  { id: 'looking', label: 'Looking for an existing worktree' },
  { id: 'creating', label: 'Creating the worktree' },
  { id: 'materializing', label: 'Adding it to the sidebar' },
  { id: 'opening', label: 'Starting the terminal' }
]

// Removing one (todomrkkvspyax): the pre-checks used to be invisible — a worktree
// with uncommitted work just failed with a notification long after the fact.
export const REMOVE_STEPS: ProgressStep[] = [
  { id: 'checking', label: 'Checking for uncommitted work' },
  { id: 'removing', label: 'Removing the worktree' },
  { id: 'cleaning', label: 'Updating the sidebar' }
]

export type Step = WorktreeStage | 'opening' | 'checking' | 'removing' | 'cleaning'

export type StepState = 'pending' | 'active' | 'done' | 'failed'

export const CLOSE_LABEL = 'Close'

class WorktreeProgressStore extends Store {
  title = ''
  steps: ProgressStep[] = CREATE_STEPS
  // Index into `steps`: everything before it is done, it is running.
  stepIndex = 0
  error = ''

  start(title: string, steps: ProgressStep[] = CREATE_STEPS): void {
    this.title = title
    this.steps = steps
    this.stepIndex = 0
    this.error = ''
  }

  setStep(step: Step): void {
    const index = this.steps.findIndex((s) => s.id === step)
    if (index >= 0) this.stepIndex = index
  }

  fail(error: string): void {
    this.error = error
  }

  // How a row renders: the failing step is the one that was running when it broke.
  stateOf(index: number): StepState {
    if (this.error) {
      if (index < this.stepIndex) return 'done'
      return index === this.stepIndex ? 'failed' : 'pending'
    }
    if (index < this.stepIndex) return 'done'
    return index === this.stepIndex ? 'active' : 'pending'
  }
}

export default new WorktreeProgressStore()
