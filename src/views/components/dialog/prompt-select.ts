import { el } from '@views/lib/dom'
import { createOverlay } from '../overlay/overlay'
import { promptText } from './prompt-text'
import '../modal/modal.css'
import '@views/components/form-field/form-field.css'

// Sentinel value carried by the optional "+ New…" choice so callers can detect it.
export const CREATE_OPTION = ' __create__'

// Modal dropdown picker (plain-DOM port of @ui dialog promptSelect). Resolves the
// chosen value ('' for the empty/none option), or null when cancelled. With
// `allowCreate`, a "+ New…" choice opens a text prompt and resolves the typed
// value. `.modal-overlay > .modal.modal-prompt` with `h2 → .field(label + select)
// → actions(Cancel + primary confirm)`, Enter=confirm / Escape=cancel, select
// focused. Self-contained — no @ui (§2.7).
export interface PromptSelectOptions {
  title: string
  label: string
  value?: string
  options: string[]
  emptyLabel?: string // label for the '' option; omit to hide the empty choice
  allowCreate?: boolean
  confirmText?: string
}

export function promptSelect(opts: PromptSelectOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const ov = createOverlay()
    const sel = el('select') as HTMLSelectElement
    if (opts.emptyLabel != null) sel.appendChild(el('option', { value: '' }, opts.emptyLabel))
    for (const opt of opts.options) sel.appendChild(el('option', { value: opt }, opt))
    if (opts.allowCreate) sel.appendChild(el('option', { value: CREATE_OPTION }, '+ New…'))
    sel.value = opts.value ?? ''

    const cancelBtn = el('button', null, 'Cancel')
    const confirmBtn = el('button', { class: 'button-primary' }, opts.confirmText ?? 'OK')

    const modal = el(
      'div',
      { class: 'modal modal-prompt', tabindex: '-1' },
      el('h2', null, opts.title),
      el('div', { class: 'field' }, el('label', null, opts.label), sel),
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
    ov.onClose(() => close(null))
    cancelBtn.addEventListener('click', () => close(null))
    confirmBtn.addEventListener('click', submit)
    sel.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') submit()
      else if (e.key === 'Escape') close(null)
    })

    ov.mount()
    sel.focus()
  })
}
