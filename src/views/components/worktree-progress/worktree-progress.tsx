import { Component } from '@geajs/core'
import './worktree-progress.css'
import { createOverlay } from '@views/components/overlay/overlay'
import store, { CLOSE_LABEL, type ProgressStep, type Step } from './worktree-progress.store'

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
    const error = store.error
    return (
      <div class="worktree-progress">
        <div class="worktree-progress-title">{store.title}</div>
        <div class="worktree-progress-steps">
          {store.steps.map((step, i) => {
            const state = store.stateOf(i)
            return (
              <div key={step.id} class={'worktree-progress-step ' + state}>
                <span class="worktree-progress-mark">
                  {state === 'done' ? '✓' : state === 'failed' ? '×' : state === 'active' ? '•' : '·'}
                </span>
                <span class="worktree-progress-label">{step.label}</span>
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
  // Leave the overlay up with git's error and a Close button. Resolves when the user
  // dismisses it, so the caller can await the acknowledgement before moving on.
  fail: (error: string) => Promise<void>
  close: () => void
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
  new WorktreeProgressShell({ onClose: dismiss }).render(overlay)
  mount()

  return {
    setStep: (step) => store.setStep(step),
    fail: (error) =>
      new Promise<void>((resolve) => {
        acknowledge = resolve
        store.fail(error)
      }),
    close
  }
}
