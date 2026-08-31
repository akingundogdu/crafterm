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
  // Optional right-hand detail (a setup script's actual command).
  detail?: string
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

// A step id: one of the fixed stages, or a `pre:<id>` / `post:<id>` setup script.
export type Step = WorktreeStage | 'opening' | 'checking' | 'removing' | 'cleaning' | (string & {})

export type StepState = 'pending' | 'active' | 'done' | 'failed'

export const CLOSE_LABEL = 'Close'

// The glyph each state shows in the row's mark column (the running one is styled
// into a spinner, so its glyph is hidden).
export const STEP_MARKS: Record<StepState, string> = {
  done: '✓',
  failed: '×',
  active: '•',
  pending: '·'
}

class WorktreeProgressStore extends Store {
  title = ''
  steps: ProgressStep[] = CREATE_STEPS
  // Index into `steps`: everything before it is done, it is running.
  stepIndex = 0
  error = ''
  // Outcome per step id, for flows whose steps report themselves (the worktree
  // setup scripts announce their own start/exit over OSC). Steps with no mark
  // fall back to the positional stepIndex rule below.
  marks: Record<string, StepState> = {}

  start(title: string, steps: ProgressStep[] = CREATE_STEPS): void {
    this.title = title
    this.steps = steps
    this.stepIndex = 0
    this.error = ''
    this.marks = {}
  }

  setStep(step: Step): void {
    const index = this.steps.findIndex((s) => s.id === step)
    if (index >= 0) {
      this.stepIndex = index
      this.repaint()
    }
  }

  // Record a step's own outcome. Starting a step also advances the cursor, so the
  // fixed stages before it read as done.
  markStep(step: Step, state: StepState): void {
    if (!this.steps.some((s) => s.id === step)) return
    this.marks = { ...this.marks, [step]: state }
    if (state === 'active') this.setStep(step)
    else this.repaint()
  }

  // A row's state is computed inside the `steps.map()` pass, so it is baked into
  // that row's class at build time — changing `stepIndex` / `marks` alone leaves
  // the painted rows untouched. Re-seating the array is what makes gea run the
  // map again and rebuild the rows with their current state.
  private repaint(): void {
    this.steps = this.steps.map((s) => ({ ...s }))
  }

  fail(error: string): void {
    this.error = error
    this.repaint()
  }

  // How a row renders: a self-reported outcome wins; otherwise the failing step is
  // the one that was running when it broke.
  //
  // The view passes the fields in (it must read them in its own template for gea
  // to track them — a read that happens inside this method is invisible to the
  // reactive system). Callers outside a template can omit them.
  stateOf(
    index: number,
    read?: { stepIndex: number; marks: Record<string, StepState>; error: string }
  ): StepState {
    const stepIndex = read?.stepIndex ?? this.stepIndex
    const marks = read?.marks ?? this.marks
    const error = read?.error ?? this.error
    const mark = marks[this.steps[index]?.id]
    if (mark) return mark
    if (error) {
      if (index < stepIndex) return 'done'
      return index === stepIndex ? 'failed' : 'pending'
    }
    if (index < stepIndex) return 'done'
    return index === stepIndex ? 'active' : 'pending'
  }
}

export default new WorktreeProgressStore()
