import { UITexts } from '@texts'
import { dbService } from '@services'
import type { EditableContext, GridContext } from './result-grid.types'
import {
  PEN_SVG,
  TRASH_SVG,
  cycleSort,
  deleteRow,
  editInitialValues,
  insertInitialValues,
  buildUpdateSql,
  buildInsertSql
} from './result-grid.state'
import { buildStatusBar } from './result-status-bar'
import { openRowFormModal } from './row-form-modal'

export type { SortState, EditableContext, GridContext } from './result-grid.types'

// Result grid renderer with optional row-level actions (edit/delete/insert)
// and column-header sort. The host pane parses the user's SQL and supplies
// `editable` context only for simple `SELECT * FROM <table>` queries — anything
// else falls back to a read-only grid. Built with plain DOM: `renderResultGrid`
// creates the head/body cells in tight loops, where gea's imperative
// `new View().render(host)` batches/defers (host still empty at
// `firstElementChild`) — the grid is the db-pane's hot path, not a reactive view
// (§2.7 self-contained, no @ui).
export function renderResultGrid(host: HTMLElement, ctx: GridContext): void {
  host.replaceChildren()
  host.appendChild(buildStatusBar(ctx))

  if (ctx.editable && ctx.editable.columns.length) {
    host.appendChild(buildActionsBar(ctx))
  }

  const wrap = document.createElement('div')
  wrap.className = 'db-grid-wrap'
  wrap.appendChild(buildTable(ctx))
  host.appendChild(wrap)
}

// ---- actions bar (insert) -------------------------------------------------

function buildActionsBar(ctx: GridContext): HTMLElement {
  const insertBtn = document.createElement('button')
  insertBtn.className = 'db-grid-action-btn'
  insertBtn.title = 'Insert a new row into ' + (ctx.editable?.table ?? '')
  insertBtn.innerHTML = '<span class="db-grid-action-glyph">+</span> New row'
  insertBtn.addEventListener('click', () => {
    if (!ctx.editable) return
    void openInsertModal(ctx.editable)
  })
  const bar = document.createElement('div')
  bar.className = 'db-grid-actions'
  bar.appendChild(insertBtn)
  return bar
}

// ---- table ----------------------------------------------------------------

function buildTable(ctx: GridContext): HTMLTableElement {
  const table = document.createElement('table')
  table.className = 'db-grid'
  table.append(buildHead(ctx), buildBody(ctx))
  return table
}

function buildHead(ctx: GridContext): HTMLTableSectionElement {
  const ths: HTMLElement[] = []
  for (const col of ctx.columns) {
    let th: HTMLTableCellElement
    if (ctx.onSort) {
      const arrow = document.createElement('span')
      arrow.className = 'db-grid-sort-arrow'
      const active = ctx.sort?.column === col
      if (active) arrow.textContent = ctx.sort?.dir === 'asc' ? '↑' : '↓'
      th = document.createElement('th')
      th.className = 'db-grid-sortable' + (active ? ' active' : '')
      th.tabIndex = 0
      th.addEventListener('click', () => cycleSort(ctx, col))
      th.append(document.createTextNode(col), arrow)
    } else {
      th = document.createElement('th')
      th.textContent = col
    }
    ths.push(th)
  }
  const tr = document.createElement('tr')
  const rownum = document.createElement('th')
  rownum.className = 'db-grid-rownum'
  rownum.textContent = '#'
  tr.append(rownum, ...ths)
  if (ctx.editable) {
    const actionsTh = document.createElement('th')
    actionsTh.className = 'db-grid-row-actions-th'
    tr.appendChild(actionsTh)
  }
  const thead = document.createElement('thead')
  thead.appendChild(tr)
  return thead
}

function buildBody(ctx: GridContext): HTMLTableSectionElement {
  const slice = ctx.rows.slice(0, 1000)
  const tbody = document.createElement('tbody')
  tbody.append(...slice.map((row, i) => buildRow(ctx, row, i)))
  return tbody
}

function buildRow(ctx: GridContext, row: unknown[], i: number): HTMLTableRowElement {
  const tr = document.createElement('tr')
  const rownum = document.createElement('td')
  rownum.className = 'db-grid-rownum'
  rownum.textContent = String(i + 1)
  tr.append(rownum, ...row.map((cell) => buildCell(cell)))
  if (ctx.editable) tr.appendChild(buildRowActions(ctx, row))
  return tr
}

function buildCell(cell: unknown): HTMLTableCellElement {
  const td = document.createElement('td')
  if (cell === null || cell === undefined) {
    td.className = 'db-null'
    td.textContent = UITexts.DbPane.nullValue
  } else if (typeof cell === 'number') {
    td.className = 'db-num'
    td.textContent = String(cell)
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
  edit.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!hasPk) return
    void openEditModal(editable, ctx.columns, row)
  })
  edit.disabled = !hasPk

  const del = document.createElement('button')
  del.className = 'db-row-action db-row-action-delete'
  del.title = hasPk ? 'Delete row' : 'No primary key — delete disabled'
  del.innerHTML = TRASH_SVG
  del.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!hasPk) return
    void deleteRow(editable, ctx.columns, row)
  })
  del.disabled = !hasPk

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
