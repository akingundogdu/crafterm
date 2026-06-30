import { el } from '@views/lib/dom'
import { createOverlay } from '../overlay/overlay'
import '../modal/modal.css'
import '@views/components/form-field/form-field.css'

// Small modal text prompt (plain-DOM port of @ui dialog promptText). Resolves the
// trimmed value, or null when cancelled / left empty. `.modal-overlay >
// .modal.modal-prompt` with `h2 → .field(label + input) → actions(Cancel + primary
// confirm)`, Enter=confirm / Escape=cancel, input focused+selected. Self-contained
// — no @ui (§2.7).
export interface PromptTextOptions {
  title: string
  label: string
  value?: string
  placeholder?: string
  confirmText?: string
}

export function promptText(opts: PromptTextOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const ov = createOverlay()
    const input = el('input', { type: 'text', value: opts.value ?? '', placeholder: opts.placeholder })

    const cancelBtn = el('button', null, 'Cancel')
    const confirmBtn = el('button', { class: 'button-primary' }, opts.confirmText ?? 'OK')

    const modal = el(
      'div',
      { class: 'modal modal-prompt', tabindex: '-1' },
      el('h2', null, opts.title),
      el('div', { class: 'field' }, el('label', null, opts.label), input),
      el('div', { class: 'modal-actions' }, cancelBtn, confirmBtn)
    )
    ov.overlay.appendChild(modal)

    let done = false
    const close = (result: string | null): void => {
      if (done) return
      done = true
      ov.close()
      resolve(result)
    }
    const submit = (): void => {
      const v = input.value.trim()
      close(v ? v : null)
    }
    ov.onClose(() => close(null))
    cancelBtn.addEventListener('click', () => close(null))
    confirmBtn.addEventListener('click', submit)
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') submit()
      else if (e.key === 'Escape') close(null)
    })

    ov.mount()
    input.focus()
    input.select()
  })
}
