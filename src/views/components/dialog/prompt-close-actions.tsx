import { Component } from '@geajs/core'
import { createOverlay } from '../overlay/overlay'
import '../modal/modal.css'
import './prompt-close-actions.css'

// Wide "close terminal" modal (gea port of the @ui dialog promptCloseActions):
// shows the bound task + any worktree, each a switch toggled ON by default, so
// closing also marks the task done / removes the worktree unless flipped off.
// Resolves the chosen toggles, or null when cancelled. Self-contained — no @ui.
export interface CloseActionsResult {
  markDone: boolean
  deleteWorktree: boolean
}

export interface PromptCloseActionsOptions {
  title: string
  confirmText?: string
  task?: { issueKey?: string | null; title: string }
  worktree?: { branch: string; path: string }
}

// The optional task / worktree rows use in-JSX conditionals, which only
// materialise inside a CHILD component (not a manually-mounted root). So the body
// lives here, rendered as a JSX child of the shell. The switches are UNCONTROLLED:
// checked-by-default is set in onAfterRender and read from the DOM on submit, keyed
// off `data-role`. An absent row => its checkbox is missing => that flag is false,
// matching the legacy `!!taskInput?.checked`.
class CloseActionsBody extends Component {
  declare props: {
    opts: PromptCloseActionsOptions
    onResult: (result: CloseActionsResult | null) => void
  }
  private bodyEl: HTMLElement | null = null
  private confirmBtn: HTMLButtonElement | null = null

  onAfterRender(): void {
    if (this.bodyEl) {
      this.bodyEl
        .querySelectorAll<HTMLInputElement>('.close-action-row input[type="checkbox"]')
        .forEach((input) => (input.checked = true))
    }
    this.confirmBtn?.focus()
  }

  private checked(role: string): boolean {
    return !!this.bodyEl?.querySelector<HTMLInputElement>(`input[data-role="${role}"]`)?.checked
  }

  private submit = (): void => {
    this.props.onResult({ markDone: this.checked('task'), deleteWorktree: this.checked('wt') })
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Enter') this.submit()
    else if (e.key === 'Escape') this.props.onResult(null)
  }

  template({ opts, onResult }: this['props']) {
    const task = opts.task
    const worktree = opts.worktree
    return (
      <div
        class="modal modal-prompt close-actions-modal"
        tabIndex={-1}
        ref={this.bodyEl}
        onKeyDown={this.onKeyDown}
      >
        <h2>{opts.title}</h2>
        <p class="close-actions-hint">
          Closing this terminal also applies the actions below. Turn one off to skip it.
        </p>
        {task ? (
          <label class="close-action-row">
            <div class="close-action-info">
              <div class="close-action-head">Mark task as done</div>
              <div class="close-action-detail">
                {task.issueKey ? <span class="close-action-key">{task.issueKey}</span> : null}
                <span class="close-action-title">{task.title}</span>
              </div>
            </div>
            <span class="switch">
              <input type="checkbox" data-role="task" />
              <span class="switch-slider" />
            </span>
          </label>
        ) : null}
        {worktree ? (
          <label class="close-action-row">
            <div class="close-action-info">
              <div class="close-action-head">Delete worktree (branch is kept)</div>
              <div class="close-action-detail">
                <span class="close-action-key">{worktree.branch}</span>
                <span class="close-action-path">{worktree.path}</span>
              </div>
            </div>
            <span class="switch">
              <input type="checkbox" data-role="wt" />
              <span class="switch-slider" />
            </span>
          </label>
        ) : null}
        <div class="modal-actions">
          <button onClick={() => onResult(null)}>Cancel</button>
          <button ref={this.confirmBtn} class="button-primary" onClick={this.submit}>
            {opts.confirmText ?? 'Close'}
          </button>
        </div>
      </div>
    )
  }
}

// Thin shell mounted imperatively into the @views overlay; the reactive/conditional
// markup lives in the CloseActionsBody child (conditionals only materialise inside a
// child, not a manually-mounted root). Data arrives via constructor fields.
class CloseActionsModal extends Component {
  private readonly opts: PromptCloseActionsOptions
  private readonly onResult: (result: CloseActionsResult | null) => void

  constructor(opts: {
    opts: PromptCloseActionsOptions
    onResult: (result: CloseActionsResult | null) => void
  }) {
    super()
    this.opts = opts.opts
    this.onResult = opts.onResult
  }

  template() {
    return <CloseActionsBody opts={this.opts} onResult={this.onResult} />
  }
}

export function promptCloseActions(opts: PromptCloseActionsOptions): Promise<CloseActionsResult | null> {
  return new Promise((resolve) => {
    const ov = createOverlay()
    let done = false
    const close = (result: CloseActionsResult | null): void => {
      if (done) return
      done = true
      ov.close()
      resolve(result)
    }
    ov.onClose(() => close(null))
    new CloseActionsModal({ opts, onResult: close }).render(ov.overlay)
    ov.mount()
  })
}
