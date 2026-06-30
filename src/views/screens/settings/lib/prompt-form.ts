import { el } from '@views/lib/dom'
import { createOverlay } from '@views/components/overlay/overlay'
import '@views/components/modal/modal.css'
import '@views/components/form-field/form-field.css'

// Settings-local plain-DOM port of the @ui dialog promptForm (§2.7 self-contained).
// A multi-field modal form: resolves a map of trimmed values, or null when
// cancelled. The first listed field is required (empty first field => null).
// `.modal-overlay > .modal.modal-prompt` with `h2 → .field(label + input)* →
// actions(Cancel + primary confirm)`, Enter=confirm / Escape=cancel.
export interface PromptFormField {
  key: string
  label: string
  value?: string
  placeholder?: string
}

export interface PromptFormOptions {
  title: string
  fields: PromptFormField[]
  confirmText?: string
}

export function promptForm(opts: PromptFormOptions): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const ov = createOverlay()
    const inputs: Record<string, HTMLInputElement> = {}

    const modal = el('div', { class: 'modal modal-prompt', tabindex: '-1' }, el('h2', null, opts.title))
    for (const f of opts.fields) {
      const input = el('input', { type: 'text', value: f.value ?? '', placeholder: f.placeholder }) as HTMLInputElement
      inputs[f.key] = input
      modal.appendChild(el('div', { class: 'field' }, el('label', null, f.label), input))
    }

    const cancelBtn = el('button', null, 'Cancel')
    const confirmBtn = el('button', { class: 'button-primary' }, opts.confirmText ?? 'OK')
    modal.appendChild(el('div', { class: 'modal-actions' }, cancelBtn, confirmBtn))
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
    inputs[opts.fields[0].key].focus()
    inputs[opts.fields[0].key].select()
  })
}
