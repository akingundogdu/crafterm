import type { DbColumn } from '@services/db/db.types'
import type { DbConnection } from '../../../types'
import { createOverlay } from '@ui/components'
import { makeCloseButton, promptConfirm } from '../../../dialog'
import { dbService } from '@services'
import { quoteIdent, literalOf } from '../sql-literal'

// Result grid renderer with optional row-level actions (edit/delete/insert)
// and column-header sort. The host pane parses the user's SQL and supplies
// `editable` context only for simple `SELECT * FROM <table>` queries — anything
// else falls back to a read-only grid.

export interface SortState {
  column: string
  dir: 'asc' | 'desc'
}

export interface EditableContext {
  conn: DbConnection
  table: string // table identifier as it appears in the SELECT (may be "schema.name")
  columns: DbColumn[] // metadata for the table (PK detection, types)
  // Re-run the current SQL (e.g. after edit/insert/delete) with the latest sort.
  rerun: () => void
}

export interface GridContext {
  columns: string[]
  rows: unknown[][]
  ms: number
  sort: SortState | null
  onSort?: (col: string | null, dir: 'asc' | 'desc' | null) => void
  editable?: EditableContext // when present, show row actions + "+ New row"
}

export function renderResultGrid(host: HTMLElement, ctx: GridContext): void {
  host.replaceChildren()
  host.appendChild(buildStatusBar(ctx))

  if (ctx.editable && ctx.editable.columns.length) {
    host.appendChild(buildActionsBar(ctx))
  }

  host.appendChild(
    (
      <div class="db-grid-wrap">{buildTable(ctx)}</div>
    ) as HTMLDivElement
  )
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

function cycleSort(ctx: GridContext, col: string): void {
  if (!ctx.onSort) return
  const cur = ctx.sort
  if (!cur || cur.column !== col) ctx.onSort(col, 'asc')
  else if (cur.dir === 'asc') ctx.onSort(col, 'desc')
  else ctx.onSort(null, null) // 3rd click clears sort
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
    return (<td class="db-null">NULL</td>) as HTMLTableCellElement
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

const PEN_SVG =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M11.5 1.7l2.8 2.8L5.6 13.2 2 14l.8-3.6z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>'
const TRASH_SVG =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M3 4h10M6 4V2.6h4V4M4.4 4l.7 9.4h5.8L11.6 4M6.8 6.8v4.4M9.2 6.8v4.4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'

// ---- edit / insert / delete -----------------------------------------------

async function deleteRow(
  ctx: EditableContext,
  gridColumns: string[],
  row: unknown[]
): Promise<void> {
  const engine = ctx.conn.engine
  const pkParts: string[] = []
  for (const c of ctx.columns) {
    if (!c.isPrimary) continue
    const idx = gridColumns.indexOf(c.name)
    if (idx < 0) {
      alert('Cannot delete: primary-key column "' + c.name + '" is not in the result.')
      return
    }
    pkParts.push(`${quoteIdent(c.name, engine)} = ${literalOf(row[idx], c.type)}`)
  }
  if (!pkParts.length) return
  const ok = await promptConfirm({
    title: 'Delete row?',
    message: 'This will run: DELETE FROM ' + ctx.table + ' WHERE ' + pkParts.join(' AND '),
    confirmText: 'Delete'
  })
  if (!ok) return
  const sql = `DELETE FROM ${quoteIdent(ctx.table, engine)} WHERE ${pkParts.join(' AND ')}`
  const res = await dbService.query(ctx.conn, sql)
  if (res.error) {
    alert('Delete failed: ' + res.error)
    return
  }
  ctx.rerun()
}

async function openEditModal(
  ctx: EditableContext,
  gridColumns: string[],
  row: unknown[]
): Promise<void> {
  const engine = ctx.conn.engine
  const initial: Record<string, { value: string; isNull: boolean }> = {}
  for (const c of ctx.columns) {
    const idx = gridColumns.indexOf(c.name)
    const raw = idx >= 0 ? row[idx] : null
    initial[c.name] = {
      value: raw === null || raw === undefined ? '' : String(raw),
      isNull: raw === null || raw === undefined
    }
  }
  const updated = await openRowFormModal({
    title: 'Edit row · ' + ctx.table,
    submitText: 'Save',
    columns: ctx.columns,
    initial,
    pkLocked: true
  })
  if (!updated) return

  // Build UPDATE: SET each non-PK column the user actually changed; WHERE = old PK values.
  const setParts: string[] = []
  for (const c of ctx.columns) {
    if (c.isPrimary) continue // PK is the row identifier, not edited here
    const cur = updated[c.name]
    if (!cur) continue
    const prev = initial[c.name]
    if (cur.isNull === prev.isNull && cur.value === prev.value) continue // unchanged
    const lit = cur.isNull ? 'NULL' : literalOf(cur.value, c.type)
    setParts.push(`${quoteIdent(c.name, engine)} = ${lit}`)
  }
  if (!setParts.length) return // nothing changed

  const pkParts: string[] = []
  for (const c of ctx.columns) {
    if (!c.isPrimary) continue
    const idx = gridColumns.indexOf(c.name)
    if (idx < 0) {
      alert('Cannot update: primary-key column "' + c.name + '" is not in the result.')
      return
    }
    pkParts.push(`${quoteIdent(c.name, engine)} = ${literalOf(row[idx], c.type)}`)
  }
  if (!pkParts.length) return

  const sql = `UPDATE ${quoteIdent(ctx.table, engine)} SET ${setParts.join(', ')} WHERE ${pkParts.join(' AND ')}`
  const res = await dbService.query(ctx.conn, sql)
  if (res.error) {
    alert('Update failed: ' + res.error)
    return
  }
  ctx.rerun()
}

async function openInsertModal(ctx: EditableContext): Promise<void> {
  const engine = ctx.conn.engine
  const initial: Record<string, { value: string; isNull: boolean }> = {}
  for (const c of ctx.columns) {
    // Auto-increment / default columns start as "NULL" (let the engine fill them).
    initial[c.name] = {
      value: '',
      isNull: c.nullable || c.isAutoIncrement || c.hasDefault
    }
  }
  const values = await openRowFormModal({
    title: 'New row · ' + ctx.table,
    submitText: 'Insert',
    columns: ctx.columns,
    initial,
    pkLocked: false
  })
  if (!values) return

  const cols: string[] = []
  const lits: string[] = []
  for (const c of ctx.columns) {
    const v = values[c.name]
    if (!v) continue
    // Skip auto-increment / default columns the user left as NULL — let the
    // engine apply its own value.
    if (v.isNull && (c.isAutoIncrement || c.hasDefault || c.nullable)) continue
    cols.push(quoteIdent(c.name, engine))
    lits.push(v.isNull ? 'NULL' : literalOf(v.value, c.type))
  }
  if (!cols.length) {
    alert('Nothing to insert — fill in at least one column.')
    return
  }
  const sql = `INSERT INTO ${quoteIdent(ctx.table, engine)} (${cols.join(', ')}) VALUES (${lits.join(', ')})`
  const res = await dbService.query(ctx.conn, sql)
  if (res.error) {
    alert('Insert failed: ' + res.error)
    return
  }
  ctx.rerun()
}

// ---- shared row form modal ------------------------------------------------

interface FieldValue {
  value: string
  isNull: boolean
}

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

    const cancel = (<button>Cancel</button>) as HTMLButtonElement
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
    ok.addEventListener('click', () => {
      const out: Record<string, FieldValue> = {}
      for (const c of opts.columns) {
        out[c.name] = {
          value: inputs[c.name].input.value,
          isNull: inputs[c.name].nullCb.checked
        }
      }
      close(out)
    })
    const onKey = (e: KeyboardEvent): void => {
      e.stopPropagation()
      if (e.key === 'Escape') close(null)
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        const out: Record<string, FieldValue> = {}
        for (const c of opts.columns) {
          out[c.name] = {
            value: inputs[c.name].input.value,
            isNull: inputs[c.name].nullCb.checked
          }
        }
        close(out)
      }
    }
    modal.tabIndex = -1
    modal.addEventListener('keydown', onKey)

    mount()
    const firstEditable = opts.columns.find((c) => !(opts.pkLocked && c.isPrimary))
    if (firstEditable) inputs[firstEditable.name].input.focus()
  })
}
