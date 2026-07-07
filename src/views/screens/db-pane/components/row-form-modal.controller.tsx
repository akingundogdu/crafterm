import type { DbColumn } from '@services/db/db.types'
import { createOverlay } from '@views/components/overlay/overlay'
import { UITexts } from '@texts'
import { makeCloseButton } from '@views/components/dialog/close-button'
import type { FieldValue } from './result-grid.types'
import { collectFieldValues } from './result-grid.state'

export interface RowFormModalOptions {
  title: string
  submitText: string
  columns: DbColumn[]
  initial: Record<string, FieldValue>
  pkLocked: boolean // edit: PKs are read-only; insert: PKs are editable
}

// Shared edit/insert modal: a field input per column (textarea for text-ish
// types) with a NULL toggle. open() builds the modal and resolves to the
// collected values or null on cancel. Pure — the host builds the SQL and runs it.
// Plain-DOM port — an imperative overlay widget whose fields are read back
// synchronously by collectFieldValues (§2.7 self-contained, no @ui).
export class RowFormModalController {
  private readonly opts: RowFormModalOptions
  private readonly inputs: Record<
    string,
    { input: HTMLInputElement | HTMLTextAreaElement; nullCb: HTMLInputElement }
  > = {}

  private resolve!: (result: Record<string, FieldValue> | null) => void
  private removeOverlay!: () => void

  constructor(opts: RowFormModalOptions) {
    this.opts = opts
  }

  open(): Promise<Record<string, FieldValue> | null> {
    return new Promise((resolve) => {
      this.resolve = resolve
      const { overlay, mount, close: removeOverlay } = createOverlay({ closeOnBackdrop: false })
      this.removeOverlay = removeOverlay

      const list = document.createElement('div')
      list.className = 'db-row-modal-fields'

      for (const c of this.opts.columns) {
        const lab = document.createElement('label')
        lab.className = 'db-row-modal-field-label'
        lab.innerHTML =
          `<span class="db-row-modal-col">${c.name}</span>` +
          `<span class="db-row-modal-type">${c.type}` +
          (c.isPrimary ? '<span class="db-row-modal-pk">PK</span>' : '') +
          (c.isAutoIncrement ? '<span class="db-row-modal-auto">auto</span>' : '') +
          (!c.nullable && !c.hasDefault && !c.isAutoIncrement ? '<span class="db-row-modal-req">required</span>' : '') +
          '</span>'

        const nullCb = document.createElement('input')
        nullCb.type = 'checkbox'
        nullCb.checked = this.opts.initial[c.name].isNull
        const nullWrap = document.createElement('label')
        nullWrap.className = 'db-row-modal-null'
        nullWrap.append(nullCb, ' NULL')

        const labelRow = document.createElement('div')
        labelRow.className = 'db-row-modal-field-label-row'
        labelRow.append(lab, nullWrap)

        // textarea for text-ish types, input otherwise.
        const isLong = /text|json|jsonb|character\s+varying|varchar|blob/i.test(c.type)
        const input = (isLong ? document.createElement('textarea') : document.createElement('input')) as
          | HTMLInputElement
          | HTMLTextAreaElement
        input.value = this.opts.initial[c.name].value
        if (input instanceof HTMLInputElement) input.type = 'text'
        input.className = 'db-row-modal-input'
        if (isLong) (input as HTMLTextAreaElement).rows = 3
        const lockPk = this.opts.pkLocked && c.isPrimary
        if (lockPk) {
          input.readOnly = true
          input.classList.add('db-row-modal-locked')
          nullCb.disabled = true
        }
        input.disabled = nullCb.checked && !lockPk ? false : input.disabled
        input.addEventListener('input', () => {
          if (nullCb.checked) nullCb.checked = false
        })
        nullCb.addEventListener('change', () => {
          if (nullCb.checked) input.value = ''
        })

        const field = document.createElement('div')
        field.className = 'db-row-modal-field'
        field.append(labelRow, input)
        list.appendChild(field)
        this.inputs[c.name] = { input, nullCb }
      }

      const cancel = document.createElement('button')
      cancel.textContent = UITexts.DbPane.cancel
      cancel.addEventListener('click', () => this.close(null))
      const ok = document.createElement('button')
      ok.className = 'button-primary'
      ok.textContent = this.opts.submitText
      ok.addEventListener('click', () => this.close(collectFieldValues(this.opts.columns, this.inputs)))
      const actions = document.createElement('div')
      actions.className = 'modal-actions'
      actions.append(cancel, ok)

      const modal = document.createElement('div')
      modal.className = 'modal db-row-modal'
      const heading = document.createElement('h2')
      heading.textContent = this.opts.title
      modal.append(makeCloseButton(() => this.close(null)), heading, list, actions)
      overlay.appendChild(modal)

      overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) this.close(null)
      })
      modal.tabIndex = -1
      modal.addEventListener('keydown', this.onKey)

      mount()
      const firstEditable = this.opts.columns.find((c) => !(this.opts.pkLocked && c.isPrimary))
      if (firstEditable) this.inputs[firstEditable.name].input.focus()
    })
  }

  private close = (result: Record<string, FieldValue> | null): void => {
    this.removeOverlay()
    this.resolve(result)
  }

  private onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') this.close(null)
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) this.close(collectFieldValues(this.opts.columns, this.inputs))
  }
}
