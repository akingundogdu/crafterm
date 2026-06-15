import type { DbColumn } from '../../preload/api'
import type { DbConnection, DbEngine } from './types'
import { makeCloseButton, promptConfirm } from './dialog'
import { dbService } from './services/ipc'

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

  const wrap = document.createElement('div')
  wrap.className = 'db-grid-wrap'
  const table = buildTable(ctx)
  wrap.appendChild(table)
  host.appendChild(wrap)
}

// ---- status bar -----------------------------------------------------------

function buildStatusBar(ctx: GridContext): HTMLElement {
  const status = document.createElement('div')
  status.className = 'db-result-status'
  const shown = Math.min(ctx.rows.length, 1000)
  status.innerHTML =
    `<span class="db-result-rows">${ctx.rows.length} row${ctx.rows.length === 1 ? '' : 's'}</span>` +
    (ctx.rows.length > shown ? `<span class="db-muted"> (showing ${shown})</span>` : '') +
    `<span class="db-result-ms">${ctx.ms}ms</span>`
  return status
}

// ---- actions bar (insert) -------------------------------------------------

function buildActionsBar(ctx: GridContext): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'db-grid-actions'
  const insertBtn = document.createElement('button')
  insertBtn.className = 'db-grid-action-btn'
  insertBtn.innerHTML = '<span class="db-grid-action-glyph">+</span> New row'
  insertBtn.title = 'Insert a new row into ' + (ctx.editable?.table ?? '')
  insertBtn.addEventListener('click', () => {
    if (!ctx.editable) return
    void openInsertModal(ctx.editable)
  })
  bar.appendChild(insertBtn)
  return bar
}

// ---- table ----------------------------------------------------------------

function buildTable(ctx: GridContext): HTMLTableElement {
  const table = document.createElement('table')
  table.className = 'db-grid'
  table.appendChild(buildHead(ctx))
  table.appendChild(buildBody(ctx))
  return table
}

function buildHead(ctx: GridContext): HTMLTableSectionElement {
  const thead = document.createElement('thead')
  const tr = document.createElement('tr')
  const corner = document.createElement('th')
  corner.className = 'db-grid-rownum'
  corner.textContent = '#'
  tr.appendChild(corner)
  for (const col of ctx.columns) {
    const th = document.createElement('th')
    if (ctx.onSort) {
      th.classList.add('db-grid-sortable')
      th.tabIndex = 0
      th.appendChild(document.createTextNode(col))
      const arrow = document.createElement('span')
      arrow.className = 'db-grid-sort-arrow'
      if (ctx.sort?.column === col) {
        arrow.textContent = ctx.sort.dir === 'asc' ? '↑' : '↓'
        th.classList.add('active')
      }
      th.appendChild(arrow)
      th.addEventListener('click', () => cycleSort(ctx, col))
    } else {
      th.textContent = col
    }
    tr.appendChild(th)
  }
  if (ctx.editable) {
    const actionsTh = document.createElement('th')
    actionsTh.className = 'db-grid-row-actions-th'
    actionsTh.textContent = ''
    tr.appendChild(actionsTh)
  }
  thead.appendChild(tr)
  return thead
}

function cycleSort(ctx: GridContext, col: string): void {
  if (!ctx.onSort) return
  const cur = ctx.sort
  if (!cur || cur.column !== col) ctx.onSort(col, 'asc')
  else if (cur.dir === 'asc') ctx.onSort(col, 'desc')
  else ctx.onSort(null, null) // 3rd click clears sort
}

function buildBody(ctx: GridContext): HTMLTableSectionElement {
  const tbody = document.createElement('tbody')
  const slice = ctx.rows.slice(0, 1000)
  slice.forEach((row, i) => tbody.appendChild(buildRow(ctx, row, i)))
  return tbody
}

function buildRow(ctx: GridContext, row: unknown[], i: number): HTMLTableRowElement {
  const tr = document.createElement('tr')
  const num = document.createElement('td')
  num.className = 'db-grid-rownum'
  num.textContent = String(i + 1)
  tr.appendChild(num)
  row.forEach((cell) => tr.appendChild(buildCell(cell)))
  if (ctx.editable) tr.appendChild(buildRowActions(ctx, row))
  return tr
}

function buildCell(cell: unknown): HTMLTableCellElement {
  const td = document.createElement('td')
  if (cell === null || cell === undefined) {
    td.textContent = 'NULL'
    td.className = 'db-null'
  } else if (typeof cell === 'number') {
    td.textContent = String(cell)
    td.className = 'db-num'
  } else if (typeof cell === 'object') {
    td.textContent = JSON.stringify(cell)
  } else {
    td.textContent = String(cell)
  }
  return td
}

function buildRowActions(ctx: GridContext, row: unknown[]): HTMLTableCellElement {
  const td = document.createElement('td')
  td.className = 'db-grid-row-actions'
  if (!ctx.editable) return td
  const editable = ctx.editable
  const hasPk = editable.columns.some((c) => c.isPrimary)

  const edit = document.createElement('button')
  edit.className = 'db-row-action'
  edit.title = hasPk ? 'Edit row' : 'No primary key — edit disabled'
  edit.innerHTML = PEN_SVG
  edit.disabled = !hasPk
  edit.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!hasPk) return
    void openEditModal(editable, ctx.columns, row)
  })

  const del = document.createElement('button')
  del.className = 'db-row-action db-row-action-del'
  del.title = hasPk ? 'Delete row' : 'No primary key — delete disabled'
  del.innerHTML = TRASH_SVG
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

// ---- SQL value formatting -------------------------------------------------

function escSingle(s: string): string {
  return s.replace(/'/g, "''")
}

// Quote a column or table identifier for the given engine.
export function quoteIdent(name: string, engine: DbEngine): string {
  // dotted names ("schema.table") are quoted segment-by-segment.
  return name
    .split('.')
    .map((part) => {
      const bare = part.replace(/^["`\[]|["`\]]$/g, '')
      if (engine === 'mysql') return '`' + bare.replace(/`/g, '``') + '`'
      return '"' + bare.replace(/"/g, '""') + '"'
    })
    .join('.')
}

// Format a JS value as a SQL literal. Caller decides nullability — pass `null`
// explicitly to emit NULL.
function literalOf(value: unknown, type: string): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (value instanceof Date) return "'" + escSingle(value.toISOString()) + "'"
  // Numeric/boolean column with a string value: try to coerce so the DB doesn't
  // reject a quoted number.
  const s = String(value)
  if (/^(int|numeric|decimal|float|double|real|bigint|smallint|tinyint)/i.test(type)) {
    if (s === '') return 'NULL'
    if (/^-?\d+(\.\d+)?$/.test(s)) return s
  }
  if (/^bool/i.test(type)) {
    if (s === '') return 'NULL'
    if (/^(true|t|1)$/i.test(s)) return 'TRUE'
    if (/^(false|f|0)$/i.test(s)) return 'FALSE'
  }
  return "'" + escSingle(s) + "'"
}

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
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    const modal = document.createElement('div')
    modal.className = 'modal db-row-modal'
    overlay.appendChild(modal)

    const close = (result: Record<string, FieldValue> | null): void => {
      overlay.remove()
      resolve(result)
    }
    modal.appendChild(makeCloseButton(() => close(null)))

    const h = document.createElement('h2')
    h.textContent = opts.title
    modal.appendChild(h)

    const list = document.createElement('div')
    list.className = 'db-row-modal-fields'
    modal.appendChild(list)

    const inputs: Record<
      string,
      { input: HTMLInputElement | HTMLTextAreaElement; nullCb: HTMLInputElement }
    > = {}

    for (const c of opts.columns) {
      const field = document.createElement('div')
      field.className = 'db-row-modal-field'

      const labelRow = document.createElement('div')
      labelRow.className = 'db-row-modal-field-label-row'
      const lab = document.createElement('label')
      lab.className = 'db-row-modal-field-label'
      lab.innerHTML =
        `<span class="db-row-modal-col">${c.name}</span>` +
        `<span class="db-row-modal-type">${c.type}` +
        (c.isPrimary ? '<span class="db-row-modal-pk">PK</span>' : '') +
        (c.isAutoIncrement ? '<span class="db-row-modal-auto">auto</span>' : '') +
        (!c.nullable && !c.hasDefault && !c.isAutoIncrement ? '<span class="db-row-modal-req">required</span>' : '') +
        '</span>'

      const nullWrap = document.createElement('label')
      nullWrap.className = 'db-row-modal-null'
      const nullCb = document.createElement('input')
      nullCb.type = 'checkbox'
      nullCb.checked = opts.initial[c.name].isNull
      nullWrap.append(nullCb, document.createTextNode(' NULL'))
      labelRow.append(lab, nullWrap)
      field.appendChild(labelRow)

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
      field.appendChild(input)
      list.appendChild(field)
      inputs[c.name] = { input, nullCb }
    }

    const actions = document.createElement('div')
    actions.className = 'modal-actions'
    const cancel = document.createElement('button')
    cancel.textContent = 'Cancel'
    const ok = document.createElement('button')
    ok.className = 'primary'
    ok.textContent = opts.submitText
    actions.append(cancel, ok)
    modal.appendChild(actions)

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

    document.body.appendChild(overlay)
    const firstEditable = opts.columns.find((c) => !(opts.pkLocked && c.isPrimary))
    if (firstEditable) inputs[firstEditable.name].input.focus()
  })
}

