import { el } from '@views/lib/dom'
import { sqlPanes, paneActions, settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import type { DbConnection } from '@views/types/types'
import type { DbColumn } from '@services/db/db.types'
import { createSqlEditor, type SqlEditor } from '@views/editor/sql-editor/sql-editor'
import { currentThemeName, applyTheme } from '@views/editor/monaco/monaco-setup'
import { promptText } from '@views/components/dialog/prompt-text'
import { renderResultGrid, type SortState, type EditableContext } from './components/result-grid'
import { dbService, dbqService } from '@services'
import type { ParsedSelect } from './db-pane.types'
import {
  engineClass,
  engineLabel,
  flattenConns,
  sqlEditors,
  paneObjCache,
  paneColCache,
  schemaFor,
  parseSimpleSelect,
  emitOrderedSql
} from './db-pane.state'

// DOM nodes the controller drives. The view (db-pane.ts) builds the static
// skeleton and hands these refs over; the controller owns all state + behavior.
export interface DbPaneRefs {
  el: HTMLDivElement
  htitle: HTMLSpanElement
  dot: HTMLSpanElement
  connSel: HTMLSelectElement
  runBtn: HTMLButtonElement
  saveBtn: HTMLButtonElement
  themeSel: HTMLSelectElement
  editorHost: HTMLDivElement
  result: HTMLDivElement
}

export interface DbPaneOptions {
  connId?: string | null
  sql?: string
  fileName?: string | null
  themeName?: string
  autoRun?: boolean
}

// Owns one SQL pane's mutable state, Monaco editor and result rendering. All
// methods are closures over `this` instance state (the per-pane connection,
// parsed-select context, sort and DOM refs) — that's why they live here rather
// than in the stateless db-pane.state.ts helpers.
export class DbPaneController {
  private readonly id: string
  private readonly refs: DbPaneRefs
  private editor!: SqlEditor

  private currentConnId: string | null
  private fileName: string | null
  // Theme is global to Monaco; reflect the current global theme.
  private themeName: string
  // parsed-select context for the last run + sort state — drives row actions
  // and column-header sort re-runs.
  private lastParsed: ParsedSelect | null = null
  private sort: SortState | null = null

  constructor(id: string, refs: DbPaneRefs, opts: DbPaneOptions) {
    this.id = id
    this.refs = refs
    this.currentConnId = opts.connId ?? null
    this.fileName = opts.fileName ?? null
    this.themeName = currentThemeName()
    refs.themeSel.value = this.themeName

    // Pre-warm the @views Monaco theme registry, mirroring the @ui boot
    // (main.state `void applyTheme`). The @views editor/monaco module is a
    // distinct instance from the still-@ui main-window bootstrap, so its theme
    // registry would otherwise be initialized for the first time synchronously
    // inside createSqlEditor → ensureThemes. The async `void` keeps that
    // initialization off the synchronous construction path (matching @ui) so a
    // first SQL pane mounts even before any other editor has opened.
    void applyTheme(this.themeName)

    this.editor = createSqlEditor({
      parent: refs.editorHost,
      doc: opts.sql ?? '',
      engine: this.connOf()?.engine ?? 'postgres',
      themeName: this.themeName,
      onRun: () => void this.run()
    })
    sqlEditors.set(id, this.editor)

    this.rebuildConnOptions()
    const initialConn = this.connOf()
    if (initialConn) this.ensureSchema(initialConn)

    this.wireEvents()
    this.register()

    setTimeout(() => this.editor.focus(), 30)
    if (opts.autoRun) void this.run()
  }

  // ---- live connection list (rebuilt on each open so deleted conns vanish) ----
  private rebuildConnOptions = (): void => {
    const { connSel } = this.refs
    const conns = flattenConns()
    connSel.replaceChildren()
    if (!conns.length) {
      connSel.appendChild(el('option', { value: '' }, UITexts.DbPane.noConnections))
      this.currentConnId = null
    } else {
      connSel.append(
        ...conns.map((cn) =>
          el('option', { value: cn.conn.id }, `${cn.conn.name}  ·  ${engineLabel(cn.conn.engine)}`)
        )
      )
      if (this.currentConnId && conns.some((c) => c.conn.id === this.currentConnId)) {
        connSel.value = this.currentConnId
      } else {
        this.currentConnId = conns[0].conn.id
        connSel.value = this.currentConnId
      }
    }
    this.updateTitleAndDot()
  }

  private connOf = (): DbConnection | null => {
    if (!this.currentConnId) return null
    return flattenConns().find((c) => c.conn.id === this.currentConnId)?.conn ?? null
  }

  private updateTitleAndDot = (): void => {
    const c = this.connOf()
    this.refs.dot.className = 'db-conn-dot' + (c ? ' ' + engineClass(c.engine) : '')
    this.refs.htitle.textContent = c ? 'SQL · ' + c.name : 'SQL'
  }

  // ---- editor ----
  private ensureSchema = (conn: DbConnection): void => {
    let connObjs = paneObjCache.get(this.id)
    if (!connObjs) {
      connObjs = new Map()
      paneObjCache.set(this.id, connObjs)
    }
    this.editor.setSchema(conn.engine, schemaFor(this.id, conn))
    if (!connObjs.has(conn.id)) {
      void (async () => {
        const o = await dbService.objects(conn)
        connObjs!.set(conn.id, o)
        this.editor.setSchema(conn.engine, schemaFor(this.id, conn))
      })()
    }
  }

  // Fetch (and cache) column metadata for a (conn, table) pair.
  private loadColumns = async (conn: DbConnection, table: string): Promise<DbColumn[]> => {
    let cache = paneColCache.get(this.id)
    if (!cache) {
      cache = new Map()
      paneColCache.set(this.id, cache)
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
  private run = async (sqlOverride?: string): Promise<void> => {
    const { result } = this.refs
    const conn = this.connOf()
    if (!conn) {
      result.innerHTML = `<div class="db-error db-result-error">${UITexts.DbPane.pickConnectionFirst}</div>`
      return
    }
    const userSql = (sqlOverride ?? this.editor.getValue()).trim()
    if (!userSql) return
    result.innerHTML = `<div class="db-muted db-result-empty">${UITexts.DbPane.running}</div>`

    // Detect simple SELECT * FROM <table> on the user-typed SQL. A sort re-run
    // re-uses the same parsed context (lastParsed) so we don't lose it.
    if (sqlOverride === undefined) {
      this.lastParsed = parseSimpleSelect(userSql)
      this.sort = null // new manual query resets sort
    }
    const sqlToRun =
      sqlOverride !== undefined
        ? sqlOverride
        : this.lastParsed && this.sort
          ? emitOrderedSql(this.lastParsed, conn.engine, this.sort)
          : userSql

    const t0 = performance.now()
    const res = await dbService.query(conn, sqlToRun)
    const ms = Math.round(performance.now() - t0)

    if (res.error) {
      result.replaceChildren()
      result.appendChild(el('div', { class: 'db-error db-result-error' }, res.error))
      return
    }
    if (!res.columns.length) {
      result.replaceChildren()
      result.appendChild(
        el('div', {
          class: 'db-result-empty',
          innerHTML: `<span class="db-ok-badge">OK</span> ${res.rowCount} row(s) affected · ${ms}ms`
        })
      )
      return
    }

    // Build editable context only if the user's original SQL was a simple
    // SELECT * (otherwise edits would be ambiguous about which table to mutate).
    let editable: EditableContext | null = null
    if (this.lastParsed && conn) {
      const cols = await this.loadColumns(conn, this.lastParsed.table)
      if (cols.length) {
        editable = {
          conn,
          table: this.lastParsed.table,
          columns: cols,
          rerun: () => {
            // Re-emit the same SQL (current sort applied) without re-parsing
            // the editor — preserves the table context if user has since
            // edited the SQL.
            if (!this.lastParsed) return
            void this.run(emitOrderedSql(this.lastParsed, conn.engine, this.sort))
          }
        }
      }
    }
    renderResultGrid(result, {
      columns: res.columns,
      rows: res.rows,
      ms,
      sort: this.sort,
      onSort: this.lastParsed
        ? (col, dir) => {
            this.sort = col && dir ? { column: col, dir } : null
            // re-run with the new sort
            const conn2 = this.connOf()
            if (!conn2 || !this.lastParsed) return
            void this.run(emitOrderedSql(this.lastParsed, conn2.engine, this.sort))
          }
        : undefined,
      editable: editable ?? undefined
    })
  }

  // ---- wiring ----
  private wireEvents = (): void => {
    const { connSel, themeSel, runBtn, saveBtn, result } = this.refs

    connSel.addEventListener('change', () => {
      this.currentConnId = connSel.value || null
      this.updateTitleAndDot()
      const conn = this.connOf()
      if (conn) this.ensureSchema(conn)
      // changing the connection invalidates column metadata cache for this pane
      paneColCache.delete(this.id)
      persistence.save()
      this.updateSnap()
    })
    connSel.addEventListener('mousedown', this.rebuildConnOptions)

    themeSel.addEventListener('change', () => {
      this.themeName = themeSel.value
      settings.editorTheme = this.themeName
      void applyTheme(this.themeName)
      this.updateSnap()
      persistence.save()
    })

    runBtn.addEventListener('click', () => void this.run())
    saveBtn.addEventListener('click', () => {
      void (async () => {
        const conn = this.connOf()
        if (!conn) {
          result.innerHTML = `<div class="db-result-empty">${UITexts.DbPane.pickConnectionSaved}</div>`
          return
        }
        const nm = await promptText({
          title: 'Save query',
          label: 'File name',
          value: (this.fileName ?? '').replace(/\.sql$/i, ''),
          placeholder: 'daily-report',
          confirmText: 'Save'
        })
        if (!nm) return
        this.fileName = nm.endsWith('.sql') ? nm : nm + '.sql'
        await dbqService.write(conn.id, this.fileName, this.editor.getValue())
        persistence.save()
        window.dispatchEvent(new CustomEvent('crafterm:dbq-changed', { detail: { connId: conn.id } }))
      })()
    })
  }

  private register = (): void => {
    const { el: paneEl } = this.refs
    sqlPanes.set(this.id, {
      id: this.id,
      el: paneEl,
      connId: this.currentConnId,
      fileName: this.fileName,
      themeName: this.themeName,
      getCode: () => this.editor.getValue(),
      focus: () => {
        if (paneEl.contains(document.activeElement)) return
        this.editor.focus()
      }
    })
  }

  private updateSnap = (): void => {
    const sp = sqlPanes.get(this.id)
    if (!sp) return
    sp.connId = this.currentConnId
    sp.fileName = this.fileName
    sp.themeName = this.themeName
  }
}
