import { createField, createModal, createSelect, CREATE_OPTION } from '@ui/components'
import type { PromptSelectOptions } from '../dialog.types'
import { makeKeyHandler } from '../dialog.state'
import { promptText } from './prompt-text'

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
