import { createField, createInput, createModal } from '@ui/components'
import type { PromptTextOptions } from '../dialog.types'
import { makeKeyHandler } from '../dialog.state'

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
