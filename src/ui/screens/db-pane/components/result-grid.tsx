import type { DbColumn } from '@services/db/db.types'
import { createOverlay } from '@ui/components'
import { UITexts } from '@texts'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { dbService } from '@services'
import type { EditableContext, GridContext, FieldValue } from './result-grid.types'
import {
  PEN_SVG,
  TRASH_SVG,
  cycleSort,
  deleteRow,
  editInitialValues,
  insertInitialValues,
  buildUpdateSql,
  buildInsertSql,
  collectFieldValues
} from './result-grid.state'

export type { SortState, EditableContext, GridContext } from './result-grid.types'

// Result grid renderer with optional row-level actions (edit/delete/insert)
// and column-header sort. The host pane parses the user's SQL and supplies
// `editable` context only for simple `SELECT * FROM <table>` queries — anything
// else falls back to a read-only grid.
export function renderResultGrid(host: HTMLElement, ctx: GridContext): void {
  host.replaceChildren()
  host.appendChild(buildStatusBar(ctx))

  if (ctx.editable && ctx.editable.columns.length) {
    host.appendChild(buildActionsBar(ctx))
  }

  host.appendChild((<div class="db-grid-wrap">{buildTable(ctx)}</div>) as HTMLDivElement)
}

// ---- status bar -----------------------------------------------------------

function buildStatusBar(ctx: GridContext): HTMLElement {
  const shown = Math.min(ctx.rows.length, 1000)
  return (
    <div
      class="db-result-status"
      innerHTML={
        `<span class="db-result-rows">${ctx.rows.length} row${ctx.rows.length === 1 ? '' : 's'}</span>` +
        (ctx.rows.length > shown ? `<span class="db-muted"> (showing ${shown})</span>` : '') +
        `<span class="db-result-ms">${ctx.ms}ms</span>`
      }
    />
  ) as HTMLDivElement
}

// ---- actions bar (insert) -------------------------------------------------

function buildActionsBar(ctx: GridContext): HTMLElement {
  const insertBtn = (
    <button
      class="db-grid-action-btn"
      title={'Insert a new row into ' + (ctx.editable?.table ?? '')}
      innerHTML='<span class="db-grid-action-glyph">+</span> New row'
    />
  ) as HTMLButtonElement
  insertBtn.addEventListener('click', () => {
    if (!ctx.editable) return
    void openInsertModal(ctx.editable)
  })
  return (<div class="db-grid-actions">{insertBtn}</div>) as HTMLDivElement
}

// ---- table ----------------------------------------------------------------

function buildTable(ctx: GridContext): HTMLTableElement {
  return (
    <table class="db-grid">
      {buildHead(ctx)}
      {buildBody(ctx)}
    </table>
  ) as HTMLTableElement
}

function buildHead(ctx: GridContext): HTMLTableSectionElement {
  const ths: HTMLElement[] = []
  for (const col of ctx.columns) {
    let th: HTMLTableCellElement
    if (ctx.onSort) {
      const arrow = (<span class="db-grid-sort-arrow" />) as HTMLSpanElement
      const active = ctx.sort?.column === col
      if (active) arrow.textContent = ctx.sort?.dir === 'asc' ? '↑' : '↓'
      th = (
        <th class={'db-grid-sortable' + (active ? ' active' : '')} tabindex="0">
          {col}
          {arrow}
        </th>
      ) as HTMLTableCellElement
      th.addEventListener('click', () => cycleSort(ctx, col))
    } else {
      th = (<th>{col}</th>) as HTMLTableCellElement
    }
    ths.push(th)
  }
  return (
    <thead>
      <tr>
        <th class="db-grid-rownum">#</th>
        {ths}
        {ctx.editable && <th class="db-grid-row-actions-th" />}
      </tr>
    </thead>
  ) as HTMLTableSectionElement
}

function buildBody(ctx: GridContext): HTMLTableSectionElement {
  const slice = ctx.rows.slice(0, 1000)
  return (<tbody>{slice.map((row, i) => buildRow(ctx, row, i))}</tbody>) as HTMLTableSectionElement
}

function buildRow(ctx: GridContext, row: unknown[], i: number): HTMLTableRowElement {
  return (
    <tr>
      <td class="db-grid-rownum">{String(i + 1)}</td>
      {row.map((cell) => buildCell(cell))}
      {ctx.editable && buildRowActions(ctx, row)}
    </tr>
  ) as HTMLTableRowElement
}

function buildCell(cell: unknown): HTMLTableCellElement {
  if (cell === null || cell === undefined) {
    return (<td class="db-null">{UITexts.DbPane.nullValue}</td>) as HTMLTableCellElement
  } else if (typeof cell === 'number') {
    return (<td class="db-num">{String(cell)}</td>) as HTMLTableCellElement
  } else if (typeof cell === 'object') {
    return (<td>{JSON.stringify(cell)}</td>) as HTMLTableCellElement
  } else {
    return (<td>{String(cell)}</td>) as HTMLTableCellElement
  }
}

function buildRowActions(ctx: GridContext, row: unknown[]): HTMLTableCellElement {
  const td = (<td class="db-grid-row-actions" />) as HTMLTableCellElement
  if (!ctx.editable) return td
  const editable = ctx.editable
  const hasPk = editable.columns.some((c) => c.isPrimary)

  const edit = (
    <button
      class="db-row-action"
      title={hasPk ? 'Edit row' : 'No primary key — edit disabled'}
      innerHTML={PEN_SVG}
    />
  ) as HTMLButtonElement
  edit.disabled = !hasPk
  edit.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!hasPk) return
    void openEditModal(editable, ctx.columns, row)
  })

  const del = (
    <button
      class="db-row-action db-row-action-del"
      title={hasPk ? 'Delete row' : 'No primary key — delete disabled'}
      innerHTML={TRASH_SVG}
    />
  ) as HTMLButtonElement
  del.disabled = !hasPk
  del.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!hasPk) return
    void deleteRow(editable, ctx.columns, row)
  })

  td.append(edit, del)
  return td
}

// ---- edit / insert --------------------------------------------------------

async function openEditModal(
  ctx: EditableContext,
  gridColumns: string[],
  row: unknown[]
): Promise<void> {
  const initial = editInitialValues(ctx, gridColumns, row)
  const updated = await openRowFormModal({
    title: 'Edit row · ' + ctx.table,
    submitText: 'Save',
    columns: ctx.columns,
    initial,
    pkLocked: true
  })
  if (!updated) return
  const sql = buildUpdateSql(ctx, gridColumns, row, updated, initial)
  if (!sql) return
  const res = await dbService.query(ctx.conn, sql)
  if (res.error) {
    alert('Update failed: ' + res.error)
    return
  }
  ctx.rerun()
}

async function openInsertModal(ctx: EditableContext): Promise<void> {
  const initial = insertInitialValues(ctx)
  const values = await openRowFormModal({
    title: 'New row · ' + ctx.table,
    submitText: 'Insert',
    columns: ctx.columns,
    initial,
    pkLocked: false
  })
  if (!values) return
  const sql = buildInsertSql(ctx, values)
  if (!sql) return
  const res = await dbService.query(ctx.conn, sql)
  if (res.error) {
    alert('Insert failed: ' + res.error)
    return
  }
  ctx.rerun()
}

// ---- shared row form modal ------------------------------------------------

function openRowFormModal(opts: {
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
