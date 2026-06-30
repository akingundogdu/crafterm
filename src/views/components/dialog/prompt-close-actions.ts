import { el } from '@views/lib/dom'
import { createOverlay } from '../overlay/overlay'
import '../modal/modal.css'

// Wide "close terminal" modal (plain-DOM port of @ui dialog promptCloseActions):
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

function switchRow(heading: string, detail: HTMLElement): { row: HTMLElement; input: HTMLInputElement } {
  const input = el('input', { type: 'checkbox' })
  input.checked = true
  const row = el(
    'label',
    { class: 'close-action-row' },
    el('div', { class: 'close-action-info' }, el('div', { class: 'close-action-head' }, heading), detail),
    el('span', { class: 'switch' }, input, el('span', { class: 'switch-slider' }))
  )
  return { row, input }
}

export function promptCloseActions(opts: PromptCloseActionsOptions): Promise<CloseActionsResult | null> {
  return new Promise((resolve) => {
    const ov = createOverlay()
    let taskInput: HTMLInputElement | null = null
    let wtInput: HTMLInputElement | null = null

    const modal = el('div', { class: 'modal modal-prompt close-actions-modal', tabindex: '-1' }, el('h2', null, opts.title))

    if (opts.task) {
      const detail = el(
        'div',
        { class: 'close-action-detail' },
        opts.task.issueKey ? el('span', { class: 'close-action-key' }, opts.task.issueKey) : null,
        el('span', { class: 'close-action-title' }, opts.task.title)
      )
      const { row, input } = switchRow('Mark task as done', detail)
      taskInput = input
      modal.appendChild(row)
    }
    if (opts.worktree) {
      const detail = el(
        'div',
        { class: 'close-action-detail' },
        el('span', { class: 'close-action-key' }, opts.worktree.branch),
        el('span', { class: 'close-action-path' }, opts.worktree.path)
      )
      const { row, input } = switchRow('Delete worktree (branch is kept)', detail)
      wtInput = input
      modal.appendChild(row)
    }

    const cancelBtn = el('button', null, 'Cancel')
    const confirmBtn = el('button', { class: 'button-primary' }, opts.confirmText ?? 'Close')
    modal.appendChild(el('div', { class: 'modal-actions' }, cancelBtn, confirmBtn))
    ov.overlay.appendChild(modal)

    let done = false
    const close = (result: CloseActionsResult | null): void => {
      if (done) return
      done = true
      ov.close()
      resolve(result)
    }
    ov.onClose(() => close(null))
    confirmBtn.addEventListener('click', () =>
      close({ markDone: !!taskInput?.checked, deleteWorktree: !!wtInput?.checked })
    )
    cancelBtn.addEventListener('click', () => close(null))
    modal.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') confirmBtn.click()
      else if (e.key === 'Escape') close(null)
    })

    ov.mount()
    confirmBtn.focus()
  })
}
