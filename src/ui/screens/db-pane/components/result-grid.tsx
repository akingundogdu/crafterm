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
// else falls back to a read-only grid.
export function renderResultGrid(host: HTMLElement, ctx: GridContext): void {
  host.replaceChildren()
  host.appendChild(buildStatusBar(ctx))

  if (ctx.editable && ctx.editable.columns.length) {
    host.appendChild(buildActionsBar(ctx))
  }

  host.appendChild((<div class="db-grid-wrap">{buildTable(ctx)}</div>) as HTMLDivElement)
}

// ---- actions bar (insert) -------------------------------------------------

function buildActionsBar(ctx: GridContext): HTMLElement {
  const insertBtn = (
    <button
      class="db-grid-action-btn"
      title={'Insert a new row into ' + (ctx.editable?.table ?? '')}
      innerHTML='<span class="db-grid-action-glyph">+</span> New row'
      onClick={() => {
        if (!ctx.editable) return
        void openInsertModal(ctx.editable)
      }}
    />
  ) as HTMLButtonElement
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
        <th
          class={'db-grid-sortable' + (active ? ' active' : '')}
          tabindex="0"
          onClick={() => cycleSort(ctx, col)}
        >
          {col}
          {arrow}
        </th>
      ) as HTMLTableCellElement
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
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        if (!hasPk) return
        void openEditModal(editable, ctx.columns, row)
      }}
    />
  ) as HTMLButtonElement
  edit.disabled = !hasPk

  const del = (
    <button
      class="db-row-action db-row-action-delete"
      title={hasPk ? 'Delete row' : 'No primary key — delete disabled'}
      innerHTML={TRASH_SVG}
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        if (!hasPk) return
        void deleteRow(editable, ctx.columns, row)
      }}
    />
  ) as HTMLButtonElement
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
