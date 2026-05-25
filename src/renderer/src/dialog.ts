// A reusable "×" close button pinned to a modal's top-right corner.
// Pass the modal's close handler; the caller appends it to the `.modal` element.
export function makeCloseButton(onClose: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'modal-close'
  btn.type = 'button'
  btn.setAttribute('aria-label', 'Close')
  btn.title = 'Close (Esc)'
  btn.textContent = '×'
  btn.addEventListener('click', onClose)
  return btn
}

// Small modal text prompt (reuses the .modal styling). Resolves the trimmed
// value, or null when cancelled / left empty.
export function promptText(opts: {
  title: string
  label: string
  value?: string
  placeholder?: string
  confirmText?: string
}): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    const modal = document.createElement('div')
    modal.className = 'modal prompt-modal'

    const h = document.createElement('h2')
    h.textContent = opts.title
    modal.appendChild(h)

    const field = document.createElement('div')
    field.className = 'field'
    const lab = document.createElement('label')
    lab.textContent = opts.label
    const input = document.createElement('input')
    input.type = 'text'
    input.value = opts.value ?? ''
    if (opts.placeholder) input.placeholder = opts.placeholder
    field.append(lab, input)
    modal.appendChild(field)

    const actions = document.createElement('div')
    actions.className = 'modal-actions'
    const cancel = document.createElement('button')
    cancel.textContent = 'Cancel'
    const ok = document.createElement('button')
    ok.className = 'primary'
    ok.textContent = opts.confirmText ?? 'OK'
    actions.append(cancel, ok)
    modal.appendChild(actions)

    overlay.appendChild(modal)
    document.body.appendChild(overlay)

    let done = false
    const close = (result: string | null): void => {
      if (done) return
      done = true
      overlay.remove()
      resolve(result)
    }
    const submit = (): void => {
      const v = input.value.trim()
      close(v ? v : null)
    }
    ok.addEventListener('click', submit)
    cancel.addEventListener('click', () => close(null))
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) close(null)
    })
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
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    const modal = document.createElement('div')
    modal.className = 'modal prompt-modal'

    const h = document.createElement('h2')
    h.textContent = opts.title
    const msg = document.createElement('div')
    msg.className = 'confirm-message'
    msg.textContent = opts.message
    modal.append(h, msg)

    const actions = document.createElement('div')
    actions.className = 'modal-actions'
    const cancel = document.createElement('button')
    cancel.textContent = 'Cancel'
    const ok = document.createElement('button')
    ok.className = 'primary'
    ok.textContent = opts.confirmText ?? 'OK'
    actions.append(cancel, ok)
    modal.appendChild(actions)
    overlay.appendChild(modal)
    document.body.appendChild(overlay)

    let done = false
    const close = (v: boolean): void => {
      if (done) return
      done = true
      overlay.remove()
      resolve(v)
    }
    ok.addEventListener('click', () => close(true))
    cancel.addEventListener('click', () => close(false))
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) close(false)
    })
    const onKey = (e: KeyboardEvent): void => {
      e.stopPropagation()
      if (e.key === 'Enter') close(true)
      else if (e.key === 'Escape') close(false)
    }
    modal.tabIndex = -1
    modal.addEventListener('keydown', onKey)
    ok.focus()
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
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    const modal = document.createElement('div')
    modal.className = 'modal prompt-modal'

    const h = document.createElement('h2')
    h.textContent = opts.title
    modal.appendChild(h)

    const inputs: Record<string, HTMLInputElement> = {}
    for (const f of opts.fields) {
      const field = document.createElement('div')
      field.className = 'field'
      const lab = document.createElement('label')
      lab.textContent = f.label
      const input = document.createElement('input')
      input.type = 'text'
      input.value = f.value ?? ''
      if (f.placeholder) input.placeholder = f.placeholder
      field.append(lab, input)
      modal.appendChild(field)
      inputs[f.key] = input
    }

    const actions = document.createElement('div')
    actions.className = 'modal-actions'
    const cancel = document.createElement('button')
    cancel.textContent = 'Cancel'
    const ok = document.createElement('button')
    ok.className = 'primary'
    ok.textContent = opts.confirmText ?? 'OK'
    actions.append(cancel, ok)
    modal.appendChild(actions)

    overlay.appendChild(modal)
    document.body.appendChild(overlay)

    let done = false
    const close = (result: Record<string, string> | null): void => {
      if (done) return
      done = true
      overlay.remove()
      resolve(result)
    }
    const submit = (): void => {
      const out: Record<string, string> = {}
      for (const f of opts.fields) out[f.key] = inputs[f.key].value.trim()
      if (!out[opts.fields[0].key]) return // first field is required
      close(out)
    }
    ok.addEventListener('click', submit)
    cancel.addEventListener('click', () => close(null))
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) close(null)
    })
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
