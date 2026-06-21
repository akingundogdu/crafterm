import type { DbColumn } from '@services/db/db.types'
import { createOverlay } from '@ui/components'
import { UITexts } from '@texts'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import type { FieldValue } from './result-grid.types'
import { collectFieldValues } from './result-grid.state'

// Shared edit/insert modal: a field input per column (textarea for text-ish
// types) with a NULL toggle. Resolves to the collected values or null on
// cancel. Pure — the host builds the SQL and runs it.
export function openRowFormModal(opts: {
  title: string
  submitText: string
  columns: DbColumn[]
  initial: Record<string, FieldValue>
  pkLocked: boolean // edit: PKs are read-only; insert: PKs are editable
}): Promise<Record<string, FieldValue> | null> {
  return new Promise((resolve) => {
    const { overlay, mount, close: removeOverlay } = createOverlay({ closeOnBackdrop: false })

    const close = (result: Record<string, FieldValue> | null): void => {
      removeOverlay()
      resolve(result)
    }

    const list = (<div class="db-row-modal-fields" />) as HTMLDivElement

    const inputs: Record<
      string,
      { input: HTMLInputElement | HTMLTextAreaElement; nullCb: HTMLInputElement }
    > = {}

    for (const c of opts.columns) {
      const lab = (
        <label
          class="db-row-modal-field-label"
          innerHTML={
            `<span class="db-row-modal-col">${c.name}</span>` +
            `<span class="db-row-modal-type">${c.type}` +
            (c.isPrimary ? '<span class="db-row-modal-pk">PK</span>' : '') +
            (c.isAutoIncrement ? '<span class="db-row-modal-auto">auto</span>' : '') +
            (!c.nullable && !c.hasDefault && !c.isAutoIncrement ? '<span class="db-row-modal-req">required</span>' : '') +
            '</span>'
          }
        />
      ) as HTMLLabelElement

      const nullCb = (<input type="checkbox" />) as HTMLInputElement
      nullCb.checked = opts.initial[c.name].isNull
      const nullWrap = (<label class="db-row-modal-null" />) as HTMLLabelElement
      nullWrap.append(nullCb, document.createTextNode(' NULL'))

      const labelRow = (<div class="db-row-modal-field-label-row" />) as HTMLDivElement
      labelRow.append(lab, nullWrap)

      // textarea for text-ish types, input otherwise.
      const isLong = /text|json|jsonb|character\s+varying|varchar|blob/i.test(c.type)
      const input = (isLong ? document.createElement('textarea') : document.createElement('input')) as
        | HTMLInputElement
        | HTMLTextAreaElement
      input.value = opts.initial[c.name].value
      if (input instanceof HTMLInputElement) input.type = 'text'
      input.className = 'db-row-modal-input'
      if (isLong) (input as HTMLTextAreaElement).rows = 3
      const lockPk = opts.pkLocked && c.isPrimary
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

      const field = (<div class="db-row-modal-field" />) as HTMLDivElement
      field.append(labelRow, input)
      list.appendChild(field)
      inputs[c.name] = { input, nullCb }
    }

    const cancel = (<button>{UITexts.DbPane.cancel}</button>) as HTMLButtonElement
    const ok = (<button class="button-primary">{opts.submitText}</button>) as HTMLButtonElement
    const actions = (<div class="modal-actions" />) as HTMLDivElement
    actions.append(cancel, ok)

    const modal = (
      <div class="modal db-row-modal">
        {makeCloseButton(() => close(null))}
        <h2>{opts.title}</h2>
        {list}
        {actions}
      </div>
    ) as HTMLDivElement
    overlay.appendChild(modal)

    cancel.addEventListener('click', () => close(null))
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) close(null)
    })
    ok.addEventListener('click', () => close(collectFieldValues(opts.columns, inputs)))
    const onKey = (e: KeyboardEvent): void => {
      e.stopPropagation()
      if (e.key === 'Escape') close(null)
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) close(collectFieldValues(opts.columns, inputs))
    }
    modal.tabIndex = -1
    modal.addEventListener('keydown', onKey)

    mount()
    const firstEditable = opts.columns.find((c) => !(opts.pkLocked && c.isPrimary))
    if (firstEditable) inputs[firstEditable.name].input.focus()
  })
}
