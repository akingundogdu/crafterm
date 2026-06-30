import { el } from '@views/lib/dom'
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
// Plain-DOM (el()) port of the legacy JSX controller (§2.7 self-contained, no @ui).
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

      const list = el('div', { class: 'db-row-modal-fields' })

      for (const c of this.opts.columns) {
        const lab = el('label', {
          class: 'db-row-modal-field-label',
          innerHTML:
            `<span class="db-row-modal-col">${c.name}</span>` +
            `<span class="db-row-modal-type">${c.type}` +
            (c.isPrimary ? '<span class="db-row-modal-pk">PK</span>' : '') +
            (c.isAutoIncrement ? '<span class="db-row-modal-auto">auto</span>' : '') +
            (!c.nullable && !c.hasDefault && !c.isAutoIncrement ? '<span class="db-row-modal-req">required</span>' : '') +
            '</span>'
        })

        const nullCb = el('input', { type: 'checkbox' })
        nullCb.checked = this.opts.initial[c.name].isNull
        const nullWrap = el('label', { class: 'db-row-modal-null' }, nullCb, ' NULL')

        const labelRow = el('div', { class: 'db-row-modal-field-label-row' }, lab, nullWrap)

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

        const field = el('div', { class: 'db-row-modal-field' }, labelRow, input)
        list.appendChild(field)
        this.inputs[c.name] = { input, nullCb }
      }

      const cancel = el('button', { onClick: () => this.close(null) }, UITexts.DbPane.cancel)
      const ok = el(
        'button',
        {
          class: 'button-primary',
          onClick: () => this.close(collectFieldValues(this.opts.columns, this.inputs))
        },
        this.opts.submitText
      )
      const actions = el('div', { class: 'modal-actions' }, cancel, ok)

      const modal = el(
        'div',
        { class: 'modal db-row-modal' },
        makeCloseButton(() => this.close(null)),
        el('h2', null, this.opts.title),
        list,
        actions
      )
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
