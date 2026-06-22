import { createModal } from '@ui/components'
import type { PromptCloseActionsOptions, CloseActionsResult } from '../dialog.types'
import { makeKeyHandler } from '../dialog.state'

// Wide "close terminal" modal: shows the bound task (issue key + title) and any
// worktree this terminal lives in, each with a switch toggled ON by default so
// closing also marks the task done / removes the worktree unless the user flips
// it off. `run()` resolves the chosen toggles, or null when cancelled (terminal
// stays).
export class PromptCloseActionsController {
  private readonly opts: PromptCloseActionsOptions

  private taskInput: HTMLInputElement | null = null
  private wtInput: HTMLInputElement | null = null
  private done = false

  constructor(opts: PromptCloseActionsOptions) {
    this.opts = opts
  }

  run(): Promise<CloseActionsResult | null> {
    return new Promise((resolve) => {
      const opts = this.opts
      const m = createModal({
        title: opts.title,
        className: 'close-actions-modal',
        confirmText: opts.confirmText ?? 'Close'
      })

      if (opts.task) {
        const detail = (
          <div class="close-action-detail">
            {opts.task.issueKey ? <span class="close-action-key">{opts.task.issueKey}</span> : null}
            <span class="close-action-title">{opts.task.title}</span>
          </div>
        ) as HTMLDivElement
        const { row, input } = this.makeSwitchRow('Mark task as done', detail)
        this.taskInput = input
        m.append(row)
      }

      if (opts.worktree) {
        const detail = (
          <div class="close-action-detail">
            <span class="close-action-key">{opts.worktree.branch}</span>
            <span class="close-action-path">{opts.worktree.path}</span>
          </div>
        ) as HTMLDivElement
        const { row, input } = this.makeSwitchRow('Delete worktree (branch is kept)', detail)
        this.wtInput = input
        m.append(row)
      }

      m.mount()

      const close = (result: CloseActionsResult | null): void => {
        if (this.done) return
        this.done = true
        m.close()
        resolve(result)
      }
      m.onClose(() => close(null))
      m.confirmBtn.addEventListener('click', () =>
        close({ markDone: !!this.taskInput?.checked, deleteWorktree: !!this.wtInput?.checked })
      )
      m.cancelBtn.addEventListener('click', () => close(null))
      m.modal.tabIndex = -1
      m.modal.addEventListener('keydown', makeKeyHandler(() => m.confirmBtn.click(), () => close(null)))
      m.confirmBtn.focus()
    })
  }

  // Build a switch row: label text + optional detail, with a checked toggle.
  private makeSwitchRow = (
    heading: string,
    detailEl: HTMLElement
  ): { row: HTMLElement; input: HTMLInputElement } => {
    let input!: HTMLInputElement
    const row = (
      <label class="close-action-row">
        <div class="close-action-info">
          <div class="close-action-head">{heading}</div>
          {detailEl}
        </div>
        <span class="switch">
          <input
            type="checkbox"
            ref={(el: HTMLInputElement) => {
              // Set the property (not the attribute) so it reflects on `.checked`.
              el.checked = true
              input = el
            }}
          />
          <span class="switch-slider" />
        </span>
      </label>
    ) as HTMLLabelElement
    return { row, input }
  }
}
