import { Component } from '@geajs/core'
import './worktree-progress.css'
import { createOverlay } from '@views/components/overlay/overlay'
import store, {
  CLOSE_LABEL,
  STEP_MARKS,
  type ProgressStep,
  type Step,
  type StepState
} from './worktree-progress.store'

// The steps of a worktree creation, shown while it runs (todomr4q102cd9). Each row
// is pending → running → done; a failure stops on its row and prints git's own
// error, and the overlay stays up until dismissed rather than vanishing silently.
//
// The reactive markup lives in this JSX child: a top-level, imperatively mounted
// component does not re-subscribe to store writes (§gea gotchas), and every step
// transition is a store write.
class WorktreeProgressBody extends Component {
  declare props: { onClose: () => void }

  template({ onClose }: this['props']) {
    // The initial paint of each row; later transitions are written onto these
    // elements by paintSteps (gea leaves a bound `class` alone once built).
    const error = store.error
    const stepIndex = store.stepIndex
    const marks = store.marks
    return (
      <div class="worktree-progress">
        <div class="worktree-progress-title">{store.title}</div>
        <div class="worktree-progress-steps">
          {store.steps.map((step, i) => {
            const state = store.stateOf(i, { stepIndex, marks, error })
            return (
              <div key={step.id} class={'worktree-progress-step ' + state}>
                <span class="worktree-progress-mark">{STEP_MARKS[state]}</span>
                <span class="worktree-progress-label">{step.label}</span>
                {step.detail ? <span class="worktree-progress-detail">{step.detail}</span> : null}
              </div>
            )
          })}
        </div>
        {error !== '' && <pre class="worktree-progress-error">{error}</pre>}
        {error !== '' && (
          <div class="worktree-progress-actions">
            <button class="button-primary" onClick={onClose}>
              {CLOSE_LABEL}
            </button>
          </div>
        )}
      </div>
    )
  }
}

// Shell mounted into the overlay. `onClose` arrives through a constructor field — a
// manual `new X()` never populates `this.props`.
class WorktreeProgressShell extends Component {
  private readonly onClose: () => void

  constructor(opts: { onClose: () => void }) {
    super()
    this.onClose = opts.onClose
  }

  template() {
    return <WorktreeProgressBody onClose={this.onClose} />
  }
}

export interface WorktreeProgressHandle {
  setStep: (step: Step) => void
  // Record a step's own outcome (the setup scripts report theirs over OSC).
  markStep: (step: Step, state: StepState) => void
  // Leave the overlay up with git's error and a Close button. Resolves when the user
  // dismisses it, so the caller can await the acknowledgement before moving on.
  fail: (error: string) => Promise<void>
  close: () => void
}

// Paint the rows from the store. gea binds an element's `class` once, when the
// `steps.map()` pass builds it — it keeps text children live but never revisits
// that attribute — so a step transition has to be written onto the existing rows
// (§gea gotcha 5.11, the imperative escape hatch). Called after every store write
// that changes a row's state.
function paintSteps(overlay: HTMLElement): void {
  const rows = overlay.querySelectorAll('.worktree-progress-step')
  rows.forEach((row, i) => {
    const state = store.stateOf(i)
    row.className = 'worktree-progress-step ' + state
    const mark = row.querySelector('.worktree-progress-mark')
    if (mark) mark.textContent = STEP_MARKS[state]
  })
}

// Open the progress overlay for one worktree creation.
export function showWorktreeProgress(title: string, steps?: ProgressStep[]): WorktreeProgressHandle {
  store.start(title, steps)
  const { overlay, mount, onClose, close } = createOverlay()
  let acknowledge: (() => void) | null = null
  const dismiss = (): void => {
    close()
    acknowledge?.()
  }
  onClose(() => acknowledge?.())
  const render = (): void => {
    overlay.replaceChildren()
    new WorktreeProgressShell({ onClose: dismiss }).render(overlay)
  }
  render()
  mount()

  return {
    setStep: (step) => {
      store.setStep(step)
      paintSteps(overlay)
    },
    markStep: (step, state) => {
      store.markStep(step, state)
      paintSteps(overlay)
    },
    fail: (error) =>
      new Promise<void>((resolve) => {
        acknowledge = resolve
        store.fail(error)
        // A failure also brings in the error block + Close button, which are
        // conditional markup rather than an attribute — rebuild the whole body.
        render()
      }),
    close
  }
}
