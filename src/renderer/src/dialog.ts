// Modal prompts, rebuilt on the @crafterm/ui modal primitives. Same exported
// signatures, same DOM/classes, same behavior — callers are unchanged.
import { createButton, createField, createInput, createModal, createSelect, CREATE_OPTION } from '@crafterm/ui'

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
export function promptText(opts: {
  title: string
  label: string
  value?: string
  placeholder?: string
  confirmText?: string
}): Promise<string | null> {
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
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') submit()
      else if (e.key === 'Escape') close(null)
    })
    input.focus()
    input.select()
  })
}

// Yes/no confirmation modal. Resolves true if confirmed.
export function promptConfirm(opts: {
  title: string
  message: string
  confirmText?: string
}): Promise<boolean> {
  return new Promise((resolve) => {
    const msg = document.createElement('div')
    msg.className = 'confirm-message'
    msg.textContent = opts.message
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
    m.modal.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') close(true)
      else if (e.key === 'Escape') close(false)
    })
    m.confirmBtn.focus()
  })
}

// Wide "close terminal" modal: shows the bound task (issue key + title) and any
// worktree this terminal lives in, each with a switch toggled ON by default so
// closing also marks the task done / removes the worktree unless the user flips
// it off. Resolves the chosen toggles, or null when cancelled (terminal stays).
export function promptCloseActions(opts: {
  title: string
  confirmText?: string
  task?: { issueKey?: string | null; title: string }
  worktree?: { branch: string; path: string }
}): Promise<{ markDone: boolean; deleteWorktree: boolean } | null> {
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
      const row = document.createElement('label')
      row.className = 'close-action-row'
      const info = document.createElement('div')
      info.className = 'close-action-info'
      const head = document.createElement('div')
      head.className = 'close-action-head'
      head.textContent = heading
      info.append(head, detailEl)
      const sw = document.createElement('span')
      sw.className = 'switch'
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.checked = true
      const slider = document.createElement('span')
      slider.className = 'switch-slider'
      sw.append(input, slider)
      row.append(info, sw)
      return { row, input }
    }

    let taskInput: HTMLInputElement | null = null
    if (opts.task) {
      const detail = document.createElement('div')
      detail.className = 'close-action-detail'
      if (opts.task.issueKey) {
        const key = document.createElement('span')
        key.className = 'close-action-key'
        key.textContent = opts.task.issueKey
        detail.appendChild(key)
      }
      const title = document.createElement('span')
      title.className = 'close-action-title'
      title.textContent = opts.task.title
      detail.appendChild(title)
      const { row, input } = makeSwitchRow('Mark task as done', detail)
      taskInput = input
      m.append(row)
    }

    let wtInput: HTMLInputElement | null = null
    if (opts.worktree) {
      const detail = document.createElement('div')
      detail.className = 'close-action-detail'
      const branch = document.createElement('span')
      branch.className = 'close-action-key'
      branch.textContent = opts.worktree.branch
      const path = document.createElement('span')
      path.className = 'close-action-path'
      path.textContent = opts.worktree.path
      detail.append(branch, path)
      const { row, input } = makeSwitchRow('Delete worktree (branch is kept)', detail)
      wtInput = input
      m.append(row)
    }

    m.mount()

    let done = false
    const close = (result: { markDone: boolean; deleteWorktree: boolean } | null): void => {
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
    m.modal.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') m.confirmBtn.click()
      else if (e.key === 'Escape') close(null)
    })
    m.confirmBtn.focus()
  })
}

// Modal dropdown picker. Resolves the chosen value ('' for the empty/none
// option), or null when cancelled. With `allowCreate`, a "+ New…" choice opens
// a text prompt and resolves the typed value.
export function promptSelect(opts: {
  title: string
  label: string
  value?: string
  options: string[]
  emptyLabel?: string // label for the '' option; omit to hide the empty choice
  allowCreate?: boolean
  confirmText?: string
}): Promise<string | null> {
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
    sel.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') submit()
      else if (e.key === 'Escape') close(null)
    })
    sel.focus()
  })
}

// Multi-field modal form. Resolves a map of trimmed values, or null if cancelled.
// The first listed field must be non-empty to confirm.
export function promptForm(opts: {
  title: string
  fields: { key: string; label: string; value?: string; placeholder?: string }[]
  confirmText?: string
}): Promise<Record<string, string> | null> {
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
      const out: Record<string, string> = {}
      for (const f of opts.fields) out[f.key] = inputs[f.key].value.trim()
      if (!out[opts.fields[0].key]) return // first field is required
      close(out)
    }
    m.onClose(() => close(null))
    m.confirmBtn.addEventListener('click', submit)
    m.cancelBtn.addEventListener('click', () => close(null))
    for (const f of opts.fields) {
      inputs[f.key].addEventListener('keydown', (e) => {
        e.stopPropagation()
        if (e.key === 'Enter') submit()
        else if (e.key === 'Escape') close(null)
      })
    }
    inputs[opts.fields[0].key].focus()
    inputs[opts.fields[0].key].select()
  })
}
