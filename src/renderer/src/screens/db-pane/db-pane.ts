import { sqlPanes, paneActions, settings, uid } from '../../state'
import { persistence } from '../../services/storage/persistence.service'
import type { DbConnection, DbEngine, DbConnNode, DbNode } from '../../types'
import { createSqlEditor, type SqlEditor } from '../../editor/sql-editor'
import { ALL_THEME_NAMES, currentThemeName, applyTheme } from '../../editor/monaco-setup'
import { setupPaneDnd } from '../../pane'
import { promptText } from '../../dialog'
import type { DbObjects, DbColumn } from '../../../../preload/api'
import { renderResultGrid, type SortState } from './components/result-grid'
import { quoteIdent } from './sql-literal'
import './db-pane.css'
import { dbService } from '../../services/ipc'
import { dbConnectionRepo } from '../../services/storage/repositories'

// SQL query pane: the workbench (toolbar + editor + result grid) shown as a
// first-class pane (split next to the active pane), replacing the old modal.

const PLAY_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M5 3.5l7 4.5-7 4.5z" fill="currentColor"/></svg>'

function engineClass(e: DbEngine): string {
  return 'db-eng-' + e
}
function engineLabel(e: DbEngine): string {
  return e === 'postgres' ? 'PostgreSQL' : e === 'mysql' ? 'MySQL' : 'SQLite'
}

function flattenConns(): DbConnNode[] {
  return dbConnectionRepo.nodes()
}

// Per-pane Monaco editor teardown (dispose on close).
const sqlEditors = new Map<string, SqlEditor>()

// Per-pane caches.
const paneObjCache = new Map<string, Map<string, DbObjects>>()
// per-pane, per-(conn:table) column metadata cache; cleared when conn changes.
const paneColCache = new Map<string, Map<string, DbColumn[]>>()

function schemaFor(paneId: string, conn: DbConnection): Record<string, string[]> {
  const o = paneObjCache.get(paneId)?.get(conn.id)
  const s: Record<string, string[]> = {}
  if (o) for (const t of [...o.tables, ...o.views]) s[t] = []
  return s
}

// ---- SQL parsing ----------------------------------------------------------

// Detect a simple `SELECT * FROM <table> [ORDER BY ...] [LIMIT N]` query.
// Captures the table identifier (may be quoted / schema-qualified) and the
// optional LIMIT tail so we can splice ORDER BY between FROM and LIMIT.
interface ParsedSelect {
  table: string // raw identifier as written (we re-quote when emitting SQL)
  baseSelect: string // `SELECT * FROM <table>` (canonical)
  limitTail: string // ` LIMIT 100` (with leading space) or '' if none
  // The full SQL might have its own ORDER BY clause — when present we drop it
  // because the grid drives sorting from this point on.
}

const SIMPLE_SELECT_RE =
  /^\s*select\s+\*\s+from\s+([`"\[]?[\w.]+[`"\]]?(?:\.[`"\[]?[\w]+[`"\]]?)?)\s*(.*?)\s*;?\s*$/i

function parseSimpleSelect(sqlText: string): ParsedSelect | null {
  const m = sqlText.match(SIMPLE_SELECT_RE)
  if (!m) return null
  const table = m[1]
  const tail = m[2] ?? ''
  // strip a trailing ORDER BY (we'll add our own) but keep LIMIT
  let cleanTail = tail
  cleanTail = cleanTail.replace(/order\s+by[\s\S]*?(?=(\blimit\b|$))/i, '').trim()
  const limitMatch = cleanTail.match(/^limit\s+\d+(\s+offset\s+\d+)?$/i)
  const limitTail = limitMatch ? ' ' + limitMatch[0] : ''
  return { table, baseSelect: `SELECT * FROM ${table}`, limitTail }
}

function emitOrderedSql(parsed: ParsedSelect, engine: DbEngine, sort: SortState | null): string {
  let s = parsed.baseSelect
  if (sort) s += ` ORDER BY ${quoteIdent(sort.column, engine)} ${sort.dir.toUpperCase()}`
  s += parsed.limitTail
  return s
}

// ---- pane -----------------------------------------------------------------

export function createSqlPane(opts: {
  connId?: string | null
  sql?: string
  fileName?: string | null
  themeName?: string
  autoRun?: boolean
}): string {
  const id = uid('sq')
  const el = document.createElement('div')
  el.className = 'pane-box sql-pane'
  el.dataset.paneId = id

  // header
  const header = document.createElement('div')
  header.className = 'pane-header'
  const htitle = document.createElement('span')
  htitle.className = 'pane-title'
  htitle.textContent = 'SQL'
  const close = document.createElement('button')
  close.className = 'pane-close'
  close.textContent = '×'
  close.addEventListener('click', (e) => {
    e.stopPropagation()
    paneActions.close(id)
  })
  header.append(htitle, close)

  // body
  const body = document.createElement('div')
  body.className = 'sql-pane-body'

  // toolbar
  const bar = document.createElement('div')
  bar.className = 'db-query-bar'
  const connWrap = document.createElement('div')
  connWrap.className = 'db-conn-select'
  const dot = document.createElement('span')
  dot.className = 'db-conn-dot'
  const connSel = document.createElement('select')
  connSel.className = 'settings-select'
  const runBtn = document.createElement('button')
  runBtn.className = 'primary db-run-btn'
  runBtn.innerHTML = PLAY_SVG + '<span>Run</span><kbd>⌘↵</kbd>'
  const saveBtn = document.createElement('button')
  saveBtn.className = 'db-save-btn'
  saveBtn.textContent = 'Save .sql'
  // theme picker (right-aligned via CSS)
  const themeSel = document.createElement('select')
  themeSel.className = 'settings-select db-theme-select'
  themeSel.title = 'Editor theme'
  for (const t of ALL_THEME_NAMES) {
    const o = document.createElement('option')
    o.value = t
    o.textContent = t
    themeSel.appendChild(o)
  }
  connWrap.append(dot, connSel)
  bar.append(connWrap, runBtn, saveBtn, themeSel)

  // editor host
  const editorHost = document.createElement('div')
  editorHost.className = 'db-query-editor'

  // result
  const result = document.createElement('div')
  result.className = 'db-result'
  result.innerHTML = '<div class="db-result-empty">Run a query to see results.</div>'

  body.append(bar, editorHost, result)
  el.append(header, body)

  setupPaneDnd(el, header, id)
  el.addEventListener('mousedown', () => paneActions.select(id))

  // ---- state ----
  let currentConnId: string | null = opts.connId ?? null
  let fileName: string | null = opts.fileName ?? null
  // Theme is global to Monaco; reflect the current global theme.
  let themeName = currentThemeName()
  themeSel.value = themeName

  // parsed-select context for the last run + sort state — drives row actions
  // and column-header sort re-runs.
  let lastParsed: ParsedSelect | null = null
  let sort: SortState | null = null

  // ---- live connection list (rebuilt on each open so deleted conns vanish) ----
  const rebuildConnOptions = (): void => {
    const conns = flattenConns()
    connSel.replaceChildren()
    if (!conns.length) {
      const o = document.createElement('option')
      o.value = ''
      o.textContent = '(no connections)'
      connSel.appendChild(o)
      currentConnId = null
    } else {
      for (const cn of conns) {
        const o = document.createElement('option')
        o.value = cn.conn.id
        o.textContent = `${cn.conn.name}  ·  ${engineLabel(cn.conn.engine)}`
        connSel.appendChild(o)
      }
      if (currentConnId && conns.some((c) => c.conn.id === currentConnId)) {
        connSel.value = currentConnId
      } else {
        currentConnId = conns[0].conn.id
        connSel.value = currentConnId
      }
    }
    updateTitleAndDot()
  }

  const connOf = (): DbConnection | null => {
    if (!currentConnId) return null
    return flattenConns().find((c) => c.conn.id === currentConnId)?.conn ?? null
  }

  const updateTitleAndDot = (): void => {
    const c = connOf()
    dot.className = 'db-conn-dot' + (c ? ' ' + engineClass(c.engine) : '')
    htitle.textContent = c ? 'SQL · ' + c.name : 'SQL'
  }

  // ---- editor ----
  let editor: SqlEditor
  const ensureSchema = (conn: DbConnection): void => {
    let connObjs = paneObjCache.get(id)
    if (!connObjs) {
      connObjs = new Map()
      paneObjCache.set(id, connObjs)
    }
    editor.setSchema(conn.engine, schemaFor(id, conn))
    if (!connObjs.has(conn.id)) {
      void (async () => {
        const o = await dbService.objects(conn)
        connObjs!.set(conn.id, o)
        editor.setSchema(conn.engine, schemaFor(id, conn))
      })()
    }
  }

  // Fetch (and cache) column metadata for a (conn, table) pair.
  const loadColumns = async (conn: DbConnection, table: string): Promise<DbColumn[]> => {
    let cache = paneColCache.get(id)
    if (!cache) {
      cache = new Map()
      paneColCache.set(id, cache)
    }
    const key = `${conn.id}:${table}`
    const cached = cache.get(key)
    if (cached) return cached
    const r = await dbService.columns(conn, table)
    const cols = r.error ? [] : r.columns
    cache.set(key, cols)
    return cols
  }

  // ---- query runner ----
  const run = async (sqlOverride?: string): Promise<void> => {
    const conn = connOf()
    if (!conn) {
      result.innerHTML = '<div class="db-error db-result-error">Pick a connection first.</div>'
      return
    }
    const userSql = (sqlOverride ?? editor.getValue()).trim()
    if (!userSql) return
    result.innerHTML = '<div class="db-muted db-result-empty">Running…</div>'

    // Detect simple SELECT * FROM <table> on the user-typed SQL. A sort re-run
    // re-uses the same parsed context (lastParsed) so we don't lose it.
    if (sqlOverride === undefined) {
      lastParsed = parseSimpleSelect(userSql)
      sort = null // new manual query resets sort
    }
    const sqlToRun =
      sqlOverride !== undefined
        ? sqlOverride
        : lastParsed && sort
          ? emitOrderedSql(lastParsed, conn.engine, sort)
          : userSql

    const t0 = performance.now()
    const res = await dbService.query(conn, sqlToRun)
    const ms = Math.round(performance.now() - t0)

    if (res.error) {
      result.replaceChildren()
      const e = document.createElement('div')
      e.className = 'db-error db-result-error'
      e.textContent = res.error
      result.appendChild(e)
      return
    }
    if (!res.columns.length) {
      result.replaceChildren()
      const ok = document.createElement('div')
      ok.className = 'db-result-empty'
      ok.innerHTML = `<span class="db-ok-badge">OK</span> ${res.rowCount} row(s) affected · ${ms}ms`
      result.appendChild(ok)
      return
    }

    // Build editable context only if the user's original SQL was a simple
    // SELECT * (otherwise edits would be ambiguous about which table to mutate).
    let editable: import('./components/result-grid').EditableContext | null = null
    if (lastParsed && conn) {
      const cols = await loadColumns(conn, lastParsed.table)
      if (cols.length) {
        editable = {
          conn,
          table: lastParsed.table,
          columns: cols,
          rerun: () => {
            // Re-emit the same SQL (current sort applied) without re-parsing
            // the editor — preserves the table context if user has since
            // edited the SQL.
            if (!lastParsed) return
            void run(emitOrderedSql(lastParsed, conn.engine, sort))
          }
        }
      }
    }
    renderResultGrid(result, {
      columns: res.columns,
      rows: res.rows,
      ms,
      sort,
      onSort: lastParsed
        ? (col, dir) => {
            sort = col && dir ? { column: col, dir } : null
            // re-run with the new sort
            const conn2 = connOf()
            if (!conn2 || !lastParsed) return
            void run(emitOrderedSql(lastParsed, conn2.engine, sort))
          }
        : undefined,
      editable: editable ?? undefined
    })
  }

  // ---- wiring ----
  editor = createSqlEditor({
    parent: editorHost,
    doc: opts.sql ?? '',
    engine: connOf()?.engine ?? 'postgres',
    themeName,
    onRun: () => void run()
  })
  sqlEditors.set(id, editor)

  rebuildConnOptions()
  const initialConn = connOf()
  if (initialConn) ensureSchema(initialConn)

  connSel.addEventListener('change', () => {
    currentConnId = connSel.value || null
    updateTitleAndDot()
    const conn = connOf()
    if (conn) ensureSchema(conn)
    // changing the connection invalidates column metadata cache for this pane
    paneColCache.delete(id)
    persistence.save()
    updateSnap()
  })
  connSel.addEventListener('mousedown', rebuildConnOptions)

  themeSel.addEventListener('change', () => {
    themeName = themeSel.value
    settings.editorTheme = themeName
    void applyTheme(themeName)
    updateSnap()
    persistence.save()
  })

  runBtn.addEventListener('click', () => void run())
  saveBtn.addEventListener('click', () => {
    void (async () => {
      const conn = connOf()
      if (!conn) {
        result.innerHTML =
          '<div class="db-result-empty">Pick a connection — queries are saved under it.</div>'
        return
      }
      const nm = await promptText({
        title: 'Save query',
        label: 'File name',
        value: (fileName ?? '').replace(/\.sql$/i, ''),
        placeholder: 'daily-report',
        confirmText: 'Save'
      })
      if (!nm) return
      fileName = nm.endsWith('.sql') ? nm : nm + '.sql'
      await dbService.savedWrite(conn.id, fileName, editor.getValue())
      persistence.save()
      window.dispatchEvent(new CustomEvent('crafterm:dbq-changed', { detail: { connId: conn.id } }))
    })()
  })

  sqlPanes.set(id, {
    id,
    el,
    connId: currentConnId,
    fileName,
    themeName,
    getCode: () => editor.getValue(),
    focus: () => {
      if (el.contains(document.activeElement)) return
      editor.focus()
    }
  })

  const updateSnap = (): void => {
    const sp = sqlPanes.get(id)
    if (!sp) return
    sp.connId = currentConnId
    sp.fileName = fileName
    sp.themeName = themeName
  }

  setTimeout(() => editor.focus(), 30)
  if (opts.autoRun) void run()

  return id
}

export function destroySqlPane(id: string): void {
  sqlEditors.get(id)?.dispose()
  sqlEditors.delete(id)
  sqlPanes.delete(id)
  paneObjCache.delete(id)
  paneColCache.delete(id)
}
