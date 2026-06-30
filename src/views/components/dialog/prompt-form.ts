import { el } from '@views/lib/dom'
import { createOverlay } from '../overlay/overlay'
import '../modal/modal.css'
import '@views/components/form-field/form-field.css'

// Multi-field modal form (plain-DOM port of @ui dialog promptForm). Resolves a map
// of trimmed values, or null if cancelled. The first listed field must be
// non-empty to confirm. Self-contained — no @ui (§2.7).
export interface FormField {
  key: string
  label: string
  value?: string
  placeholder?: string
}

export interface PromptFormOptions {
  title: string
  fields: FormField[]
  confirmText?: string
}

export function promptForm(opts: PromptFormOptions): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const ov = createOverlay()
    const inputs: Record<string, HTMLInputElement> = {}

    const fieldEls = opts.fields.map((f) => {
      const input = el('input', { type: 'text', value: f.value ?? '', placeholder: f.placeholder })
      inputs[f.key] = input
      return el('div', { class: 'field' }, el('label', null, f.label), input)
    })

    const cancelBtn = el('button', null, 'Cancel')
    const confirmBtn = el('button', { class: 'button-primary' }, opts.confirmText ?? 'OK')

    const modal = el(
      'div',
      { class: 'modal modal-prompt', tabindex: '-1' },
      el('h2', null, opts.title),
      ...fieldEls,
      el('div', { class: 'modal-actions' }, cancelBtn, confirmBtn)
    )
    ov.overlay.appendChild(modal)

    let done = false
    const close = (result: Record<string, string> | null): void => {
      if (done) return
      done = true
      ov.close()
      resolve(result)
    }
    const submit = (): void => {
      const out: Record<string, string> = {}
      for (const f of opts.fields) out[f.key] = inputs[f.key].value.trim()
      if (!out[opts.fields[0].key]) return // first field is required
      close(out)
    }
    ov.onClose(() => close(null))
    cancelBtn.addEventListener('click', () => close(null))
    confirmBtn.addEventListener('click', submit)
    for (const f of opts.fields) {
      inputs[f.key].addEventListener('keydown', (e) => {
        e.stopPropagation()
        if (e.key === 'Enter') submit()
        else if (e.key === 'Escape') close(null)
      })
    }

    ov.mount()
    const first = inputs[opts.fields[0].key]
    first.focus()
    first.select()
  })
}
