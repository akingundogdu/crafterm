import { Component } from '@geajs/core'
import type { DbColumn } from '@services/db/db.types'
import { createOverlay } from '@views/components/overlay/overlay'
import { UITexts } from '@texts'
import type { FieldValue } from './result-grid.types'
import { collectFieldValues } from './result-grid.store'

export interface RowFormModalOptions {
  title: string
  submitText: string
  columns: DbColumn[]
  initial: Record<string, FieldValue>
  pkLocked: boolean // edit: PKs are read-only; insert: PKs are editable
}

const isLongType = (type: string): boolean => /text|json|jsonb|character\s+varying|varchar|blob/i.test(type)

// The edit/insert modal body: one field per column (textarea for text-ish types) with
// a NULL toggle, over Cancel / submit actions. A gea view (no controller) whose markup
// is intrinsic JSX — the inputs are UNCONTROLLED (seeded + wired in onAfterRender, the
// settings-form idiom), read back from the DOM on submit. Cross-clearing (typing clears
// NULL; NULL clears the value) is wired via event delegation on the fields container
// (not JSX handlers on nested `.map()` children — §gea plugin el2 crash). open()'s
// promise resolves with the collected values or null.
class RowFormView extends Component {
  private readonly opts: RowFormModalOptions
  private readonly done: (result: Record<string, FieldValue> | null) => void
  private modalEl: HTMLDivElement | null = null
  private fieldsEl: HTMLDivElement | null = null

  constructor(opts: RowFormModalOptions, done: (result: Record<string, FieldValue> | null) => void) {
    super()
    this.opts = opts
    this.done = done
  }

  private field(name: string): HTMLElement | null {
    return this.modalEl?.querySelector(`.db-row-modal-field[data-col="${CSS.escape(name)}"]`) ?? null
  }

  onAfterRender(): void {
    // Seed the uncontrolled inputs + NULL checkboxes; lock PKs on edit.
    for (const c of this.opts.columns) {
      const field = this.field(c.name)
      const input = field?.querySelector<HTMLInputElement | HTMLTextAreaElement>('.db-row-modal-input')
      const nullCb = field?.querySelector<HTMLInputElement>('.db-row-modal-nullcb')
      const init = this.opts.initial[c.name]
      if (input && init) input.value = init.value
      if (nullCb && init) nullCb.checked = init.isNull
      if (this.opts.pkLocked && c.isPrimary) {
        if (input) {
          input.readOnly = true
          input.classList.add('db-row-modal-locked')
        }
        if (nullCb) nullCb.disabled = true
      }
    }

    // Cross-clearing via delegation (events bubble to the fields container).
    this.fieldsEl?.addEventListener('input', (e) => {
      const t = e.target as HTMLElement
      if (!t.classList.contains('db-row-modal-input')) return
      const cb = t.closest('.db-row-modal-field')?.querySelector<HTMLInputElement>('.db-row-modal-nullcb')
      if (cb?.checked) cb.checked = false
    })
    this.fieldsEl?.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement
      if (!t.classList.contains('db-row-modal-nullcb') || !t.checked) return
      const input = t.closest('.db-row-modal-field')?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        '.db-row-modal-input'
      )
      if (input) input.value = ''
    })

    const firstEditable = this.opts.columns.find((c) => !(this.opts.pkLocked && c.isPrimary))
    if (firstEditable) {
      this.field(firstEditable.name)?.querySelector<HTMLInputElement>('.db-row-modal-input')?.focus()
    }
  }

  // Read every field's value + NULL state back from the DOM, keyed by column.
  private collect = (): Record<string, FieldValue> => {
    const inputs: Record<string, { input: HTMLInputElement | HTMLTextAreaElement; nullCb: HTMLInputElement }> = {}
    for (const c of this.opts.columns) {
      const field = this.field(c.name)
      inputs[c.name] = {
        input: field?.querySelector('.db-row-modal-input') as HTMLInputElement | HTMLTextAreaElement,
        nullCb: field?.querySelector('.db-row-modal-nullcb') as HTMLInputElement
      }
    }
    return collectFieldValues(this.opts.columns, inputs)
  }

  private onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') this.done(null)
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) this.done(this.collect())
  }

  template() {
    const { opts } = this
    return (
      <div class="modal db-row-modal" tabIndex={-1} ref={this.modalEl} onKeyDown={this.onKey}>
        <button
          class="modal-close"
          type="button"
          aria-label="Close"
          title="Close (Esc)"
          onClick={() => this.done(null)}
        >
          ×
        </button>
        <h2>{opts.title}</h2>
        <div class="db-row-modal-fields" ref={this.fieldsEl}>
          {opts.columns.map((c) => (
            <div key={c.name} class="db-row-modal-field" data-col={c.name}>
              <div class="db-row-modal-field-label-row">
                <label class="db-row-modal-field-label">
                  <span class="db-row-modal-col">{c.name}</span>
                  <span class="db-row-modal-type">
                    <span>{c.type}</span>
                    {c.isPrimary ? <span class="db-row-modal-pk">PK</span> : null}
                    {c.isAutoIncrement ? <span class="db-row-modal-auto">auto</span> : null}
                    {!c.nullable && !c.hasDefault && !c.isAutoIncrement ? (
                      <span class="db-row-modal-req">required</span>
                    ) : null}
                  </span>
                </label>
                <label class="db-row-modal-null">
                  <input type="checkbox" class="db-row-modal-nullcb" /> <span>NULL</span>
                </label>
              </div>
              {isLongType(c.type) ? (
                <textarea class="db-row-modal-input" rows={3} />
              ) : (
                <input type="text" class="db-row-modal-input" />
              )}
            </div>
          ))}
        </div>
        <div class="modal-actions">
          <button onClick={() => this.done(null)}>{UITexts.DbPane.cancel}</button>
          <button class="button-primary" onClick={() => this.done(this.collect())}>
            {opts.submitText}
          </button>
        </div>
      </div>
    )
  }
}

// Shared edit/insert modal: a field input per column with a NULL toggle. Resolves to
// the collected values or null on cancel. Pure — the host builds the SQL and runs it.
export function openRowFormModal(opts: RowFormModalOptions): Promise<Record<string, FieldValue> | null> {
  return new Promise((resolve) => {
    const { overlay, mount, close } = createOverlay({ closeOnBackdrop: false })
    const done = (result: Record<string, FieldValue> | null): void => {
      close()
      resolve(result)
    }
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) done(null)
    })
    new RowFormView(opts, done).render(overlay)
    mount()
  })
}
