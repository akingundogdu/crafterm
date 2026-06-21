import { createField, createInput, createModal } from '@ui/components'
import type { PromptFormOptions } from '../dialog.types'
import { makeKeyHandler, collectFormValues } from '../dialog.state'

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
