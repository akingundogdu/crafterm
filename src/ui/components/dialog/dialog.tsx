// Modal prompts, rebuilt on the @crafterm/ui modal primitives. Same exported
// signatures, same DOM/classes, same behavior — callers are unchanged.
import './dialog.css'
import { createButton, createField, createInput, createModal, createSelect, CREATE_OPTION } from '@ui/components'
import type {
  PromptTextOptions,
  PromptConfirmOptions,
  PromptCloseActionsOptions,
  CloseActionsResult,
  PromptSelectOptions,
  PromptFormOptions
} from './dialog.types'
import { makeKeyHandler, collectFormValues } from './dialog.state'

export type {
  PromptTextOptions,
  PromptConfirmOptions,
  PromptCloseActionsOptions,
  CloseActionsResult,
  PromptSelectOptions,
  PromptFormOptions,
  FormField
} from './dialog.types'

// A reusable "×" close button pinned to a modal's top-right corner.
// Pass the modal's close handler; the caller appends it to the `.modal` element.
export function makeCloseButton(onClose: () => void): HTMLButtonElement {
  return createButton({
    text: '×',
    className: 'modal-close',
    type: 'button',
    ariaLabel: 'Close',
    title: 'Close (Esc)',
    onClick: onClose
  })
}

// Small modal text prompt. Resolves the trimmed value, or null when cancelled /
// left empty.
export function promptText(opts: PromptTextOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const input = createInput({ value: opts.value, placeholder: opts.placeholder })
    const m = createModal({ title: opts.title, confirmText: opts.confirmText })
    m.append(createField(opts.label, input))
    m.mount()

    let done = false
    const close = (result: string | null): void => {
      if (done) return
      done = true
      m.close()
      resolve(result)
    }
    const submit = (): void => {
      const v = input.value.trim()
      close(v ? v : null)
    }
    m.onClose(() => close(null))
    m.confirmBtn.addEventListener('click', submit)
    m.cancelBtn.addEventListener('click', () => close(null))
    input.addEventListener('keydown', makeKeyHandler(submit, () => close(null)))
    input.focus()
    input.select()
  })
}

// Yes/no confirmation modal. Resolves true if confirmed.
export function promptConfirm(opts: PromptConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const msg = (<div class="modal-confirm-message">{opts.message}</div>) as HTMLDivElement
    const m = createModal({ title: opts.title, confirmText: opts.confirmText })
    m.append(msg)
    m.mount()

    let done = false
    const close = (v: boolean): void => {
      if (done) return
      done = true
      m.close()
      resolve(v)
    }
    m.onClose(() => close(false))
    m.confirmBtn.addEventListener('click', () => close(true))
    m.cancelBtn.addEventListener('click', () => close(false))
    m.modal.tabIndex = -1
    m.modal.addEventListener('keydown', makeKeyHandler(() => close(true), () => close(false)))
    m.confirmBtn.focus()
  })
}

// Wide "close terminal" modal: shows the bound task (issue key + title) and any
// worktree this terminal lives in, each with a switch toggled ON by default so
// closing also marks the task done / removes the worktree unless the user flips
// it off. Resolves the chosen toggles, or null when cancelled (terminal stays).
export function promptCloseActions(opts: PromptCloseActionsOptions): Promise<CloseActionsResult | null> {
  return new Promise((resolve) => {
    const m = createModal({
      title: opts.title,
      className: 'close-actions-modal',
      confirmText: opts.confirmText ?? 'Close'
    })

    // Build a switch row: label text + optional detail, with a checked toggle.
    const makeSwitchRow = (
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

    let taskInput: HTMLInputElement | null = null
    if (opts.task) {
      const detail = (
        <div class="close-action-detail">
          {opts.task.issueKey ? <span class="close-action-key">{opts.task.issueKey}</span> : null}
          <span class="close-action-title">{opts.task.title}</span>
        </div>
      ) as HTMLDivElement
      const { row, input } = makeSwitchRow('Mark task as done', detail)
      taskInput = input
      m.append(row)
    }

    let wtInput: HTMLInputElement | null = null
    if (opts.worktree) {
      const detail = (
        <div class="close-action-detail">
          <span class="close-action-key">{opts.worktree.branch}</span>
          <span class="close-action-path">{opts.worktree.path}</span>
        </div>
      ) as HTMLDivElement
      const { row, input } = makeSwitchRow('Delete worktree (branch is kept)', detail)
      wtInput = input
      m.append(row)
    }

    m.mount()

    let done = false
    const close = (result: CloseActionsResult | null): void => {
      if (done) return
      done = true
      m.close()
      resolve(result)
    }
    m.onClose(() => close(null))
    m.confirmBtn.addEventListener('click', () =>
      close({ markDone: !!taskInput?.checked, deleteWorktree: !!wtInput?.checked })
    )
    m.cancelBtn.addEventListener('click', () => close(null))
    m.modal.tabIndex = -1
    m.modal.addEventListener('keydown', makeKeyHandler(() => m.confirmBtn.click(), () => close(null)))
    m.confirmBtn.focus()
  })
}

// Modal dropdown picker. Resolves the chosen value ('' for the empty/none
// option), or null when cancelled. With `allowCreate`, a "+ New…" choice opens
// a text prompt and resolves the typed value.
export function promptSelect(opts: PromptSelectOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const sel = createSelect({
      options: opts.options,
      value: opts.value,
      emptyLabel: opts.emptyLabel,
      allowCreate: opts.allowCreate
    })
    const m = createModal({ title: opts.title, confirmText: opts.confirmText })
    m.append(createField(opts.label, sel))
    m.mount()

    let done = false
    const close = (result: string | null): void => {
      if (done) return
      done = true
      m.close()
      resolve(result)
    }
    const submit = (): void => {
      if (sel.value === CREATE_OPTION) {
        void promptText({
          title: opts.title,
          label: 'New ' + opts.label,
          placeholder: opts.label,
          confirmText: 'Add'
        }).then((v) => close(v))
        return
      }
      close(sel.value)
    }
    m.onClose(() => close(null))
    m.confirmBtn.addEventListener('click', submit)
    m.cancelBtn.addEventListener('click', () => close(null))
    sel.addEventListener('keydown', makeKeyHandler(submit, () => close(null)))
    sel.focus()
  })
}

// Multi-field modal form. Resolves a map of trimmed values, or null if cancelled.
// The first listed field must be non-empty to confirm.
export function promptForm(opts: PromptFormOptions): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const m = createModal({ title: opts.title, confirmText: opts.confirmText })
    const inputs: Record<string, HTMLInputElement> = {}
    for (const f of opts.fields) {
      const input = createInput({ value: f.value, placeholder: f.placeholder })
      m.append(createField(f.label, input))
      inputs[f.key] = input
    }
    m.mount()

    let done = false
    const close = (result: Record<string, string> | null): void => {
      if (done) return
      done = true
      m.close()
      resolve(result)
    }
    const submit = (): void => {
      const out = collectFormValues(opts.fields, inputs)
      if (!out) return // first field is required
      close(out)
    }
    m.onClose(() => close(null))
    m.confirmBtn.addEventListener('click', submit)
    m.cancelBtn.addEventListener('click', () => close(null))
    for (const f of opts.fields) {
      inputs[f.key].addEventListener('keydown', makeKeyHandler(submit, () => close(null)))
    }
    inputs[opts.fields[0].key].focus()
    inputs[opts.fields[0].key].select()
  })
}
