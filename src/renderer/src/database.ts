import { settings, saveSoon, uid } from './state'
import type { DbNode, DbGroup, DbConnNode, DbConnection, DbEngine } from './types'
import type { DbObjects } from '../../preload/api'
import { makeCloseButton, promptText } from './dialog'
import { createSqlEditor } from './sqlEditor'
import { createTreeView, type TreeAdapter, type TreeView, type DropPos } from './treeview'

// Database tool: a project/folder/connection tree in the sidebar, live object
// introspection under each connection, a Queries section of saved .sql files,
// and a query editor (run SQL → results grid, save as .sql).

const GROUP_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1.6 4.4c0-.6.4-1 1-1h3.1l1.2 1.4H13.4c.6 0 1 .4 1 1V11.6c0 .6-.4 1-1 1H2.6c-.6 0-1-.4-1-1z" fill="currentColor"/></svg>'
const DB_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><ellipse cx="8" cy="3.4" rx="5" ry="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 3.4v9.2c0 1.1 2.2 2 5 2s5-.9 5-2V3.4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>'
// object-type glyphs: table (grid), view (eye), procedure (ƒ)
const TABLE_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.4" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2 6.4h12M2 9.6h12M6 6.4v6.6" fill="none" stroke="currentColor" stroke-width="1"/></svg>'
const VIEW_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8s-2.4 4.2-6.5 4.2S1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="1.9" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>'
const PROC_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M9.5 3.2c-1.3 0-2 .8-2.2 2L7 6.2H5.4M5 12.8c1.3 0 2-.8 2.2-2l.9-6.1M4.6 8.2h4.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>'
const PLAY_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M5 3.5l7 4.5-7 4.5z" fill="currentColor"/></svg>'

// Per-engine accent (drives the connection dot + engine pill colors).
function engineClass(e: DbEngine): string {
  return 'db-eng-' + e
}

const QUERY_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 1.6h5l3 3v9.8H4z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M9 1.6v3h3" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M6 8.2l1.4 1.4L6 11M9 11h1.6" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>'

let container: HTMLElement | null = null
const expanded = new Set<string>() // group/conn ids
const subOpen = new Set<string>() // "<connId>:tables|views|procedures|queries"
const objCache = new Map<string, DbObjects>()
const queriesCache = new Map<string, { name: string; path: string }[]>()

function engineLabel(e: DbEngine): string {
  return e === 'postgres' ? 'PostgreSQL' : e === 'mysql' ? 'MySQL' : 'SQLite'
}

// ---- tree helpers (operate on settings.dbTree) ----

function flattenConns(nodes: DbNode[] = settings.dbTree): DbConnNode[] {
  const out: DbConnNode[] = []
  for (const n of nodes) {
    if (n.kind === 'conn') out.push(n)
    else out.push(...flattenConns(n.children))
  }
  return out
}

function findGroup(id: string, nodes: DbNode[] = settings.dbTree): DbGroup | null {
  for (const n of nodes) {
    if (n.kind === 'group') {
      if (n.id === id) return n
      const r = findGroup(id, n.children)
      if (r) return r
    }
  }
  return null
}

function removeNode(id: string, nodes: DbNode[] = settings.dbTree): boolean {
  const i = nodes.findIndex((n) => n.id === id)
  if (i >= 0) {
    nodes.splice(i, 1)
    return true
  }
  for (const n of nodes) {
    if (n.kind === 'group' && removeNode(id, n.children)) return true
  }
  return false
}

// ---- rendering ----

export async function renderDatabase(host: HTMLElement): Promise<void> {
  container = host
  await refresh()
}

// ---- unified tree node (real groups/connections + dynamic objects/queries) ----

type DbSectionKind = 'Tables' | 'Views' | 'Procedures' | 'Queries'
type DbTreeNode =
  | { t: 'group'; g: DbGroup }
  | { t: 'conn'; c: DbConnNode }
  | { t: 'section'; conn: DbConnection; kind: DbSectionKind }
  | { t: 'object'; conn: DbConnection; kind: 'Tables' | 'Views' | 'Procedures'; name: string }
  | { t: 'query'; conn: DbConnection; file: { name: string; path: string } }

const wrap = (n: DbNode): DbTreeNode => (n.kind === 'group' ? { t: 'group', g: n } : { t: 'conn', c: n })

function sectionGlyph(k: DbSectionKind): string {
  return k === 'Tables' ? TABLE_SVG : k === 'Views' ? VIEW_SVG : k === 'Procedures' ? PROC_SVG : QUERY_SVG
}
function sectionItems(conn: DbConnection, kind: DbSectionKind): DbTreeNode[] {
  if (kind === 'Queries') {
    return (queriesCache.get(conn.id) ?? []).map((file) => ({ t: 'query', conn, file }))
  }
  const objs = objCache.get(conn.id)
  const list = objs ? (kind === 'Tables' ? objs.tables : kind === 'Views' ? objs.views : objs.procedures) : []
  return list.map((name) => ({ t: 'object', conn, kind, name }))
}
function sectionCount(conn: DbConnection, kind: DbSectionKind): number {
  return sectionItems(conn, kind).length
}

function pill(cls: string, text: string): HTMLElement {
  const s = document.createElement('span')
  s.className = cls
  s.textContent = text
  return s
}

// Load a connection's objects + saved queries the first time it's expanded.
function ensureConnLoaded(conn: DbConnection): void {
  if (objCache.has(conn.id)) return
  void (async () => {
    const [objs, queries] = await Promise.all([
      window.crafterm.dbObjects(conn),
      window.crafterm.dbqList(conn.id)
    ])
    objCache.set(conn.id, objs)
    queriesCache.set(conn.id, queries)
    void refresh()
  })()
}

async function renameConn(c: DbConnNode): Promise<void> {
  const name = await promptText({ title: 'Rename', label: 'Name', value: c.conn.name, confirmText: 'Rename' })
  if (!name) return
  c.conn.name = name
  saveSoon()
  void refresh()
}

function deleteQuery(conn: DbConnection, fileName: string): void {
  void (async () => {
    await window.crafterm.dbqDelete(conn.id, fileName)
    await reloadQueries(conn.id)
  })()
}
function openQueryFile(conn: DbConnection, fileName: string): void {
  void (async () => {
    const sql = await window.crafterm.dbqRead(conn.id, fileName)
    openQueryEditor({ connId: conn.id, sql, fileName })
  })()
}

// ---- drag-drop reorder/nesting over settings.dbTree ----

function locate(id: string, arr: DbNode[] = settings.dbTree): { arr: DbNode[]; i: number; node: DbNode } | null {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].id === id) return { arr, i, node: arr[i] }
    const n = arr[i]
    if (n.kind === 'group') {
      const r = locate(id, n.children)
      if (r) return r
    }
  }
  return null
}
function containsId(node: DbNode, id: string): boolean {
  if (node.id === id) return true
  return node.kind === 'group' ? node.children.some((c) => containsId(c, id)) : false
}
function moveDbNode(dragId: string, targetId: string, pos: DropPos): void {
  if (dragId === targetId || targetId.includes(':')) return // pseudo target → ignore
  const src = locate(dragId)
  if (!src) return
  if (src.node.kind === 'group' && containsId(src.node, targetId)) return // no cycle
  const dragged = src.node
  src.arr.splice(src.i, 1)
  const dst = locate(targetId)
  if (!dst) {
    src.arr.splice(src.i, 0, dragged) // target gone — put it back
    return
  }
  if (pos === 'inside' && dst.node.kind === 'group') {
    dst.node.children.push(dragged)
  } else {
    dst.arr.splice(pos === 'before' ? dst.i : dst.i + 1, 0, dragged)
  }
  saveSoon()
  void refresh()
}

// ---- TreeView adapter ----

const adapter: TreeAdapter<DbTreeNode> = {
  id: (n) =>
    n.t === 'group'
      ? n.g.id
      : n.t === 'conn'
        ? n.c.id
        : n.t === 'section'
          ? `sec:${n.conn.id}:${n.kind}`
          : n.t === 'object'
            ? `obj:${n.conn.id}:${n.kind}:${n.name}`
            : `q:${n.conn.id}:${n.file.name}`,
  label: (n) =>
    n.t === 'group'
      ? n.g.name
      : n.t === 'conn'
        ? n.c.conn.name
        : n.t === 'section'
          ? n.kind
          : n.t === 'object'
            ? n.name
            : n.file.name.replace(/\.sql$/i, ''),
  icon: (n) =>
    n.t === 'group'
      ? GROUP_SVG
      : n.t === 'conn'
        ? DB_SVG
        : n.t === 'section'
          ? sectionGlyph(n.kind)
          : n.t === 'object'
            ? sectionGlyph(n.kind)
            : QUERY_SVG,
  iconClass: (n) =>
    n.t === 'conn'
      ? 'db-icon ' + engineClass(n.c.conn.engine)
      : n.t === 'section' || n.t === 'object' || n.t === 'query'
        ? 'db-section-icon'
        : '',
  trailing: (n) => {
    if (n.t === 'conn') return pill('db-eng-pill ' + engineClass(n.c.conn.engine), enginePillText(n.c.conn.engine))
    if (n.t === 'section') return pill('db-count-pill', String(sectionCount(n.conn, n.kind)))
    return null
  },
  rowClass: (n) => (n.t === 'section' ? 'db-section-row' : n.t === 'object' || n.t === 'query' ? 'db-obj-row' : ''),
  isContainer: (n) => n.t === 'group' || n.t === 'conn' || n.t === 'section',
  children: (n) => {
    if (n.t === 'group') return n.g.children.map(wrap)
    if (n.t === 'conn') {
      const conn = n.c.conn
      return (['Tables', 'Views', 'Procedures', 'Queries'] as DbSectionKind[]).map((kind) => ({
        t: 'section' as const,
        conn,
        kind
      }))
    }
    if (n.t === 'section') return sectionItems(n.conn, n.kind)
    return []
  },
  collapsed: (n) => {
    if (n.t === 'group' || n.t === 'conn') return !expanded.has(adapter.id(n))
    if (n.t === 'section') return !subOpen.has(`${n.conn.id}:${n.kind}`)
    return true
  },
  draggable: (n) => n.t === 'group' || n.t === 'conn',
  renamable: (n) => n.t === 'group' || n.t === 'conn',
  color: (n) => (n.t === 'group' ? (n.g.color ?? null) : n.t === 'conn' ? (n.c.color ?? null) : null),
  onColor: (n, c) => {
    if (n.t === 'group') n.g.color = c
    else if (n.t === 'conn') n.c.color = c
    else return
    saveSoon()
    void refresh()
  },
  onToggle: (n) => {
    if (n.t === 'group' || n.t === 'conn') {
      const id = adapter.id(n)
      if (expanded.has(id)) expanded.delete(id)
      else {
        expanded.add(id)
        if (n.t === 'conn') ensureConnLoaded(n.c.conn)
      }
      void refresh()
    } else if (n.t === 'section') {
      const key = `${n.conn.id}:${n.kind}`
      if (subOpen.has(key)) subOpen.delete(key)
      else subOpen.add(key)
      void refresh()
    }
  },
  onActivate: (n) => {
    if (n.t === 'object') {
      openQueryEditor({ connId: n.conn.id, sql: `SELECT * FROM ${n.name} LIMIT 100;`, run: true })
    } else if (n.t === 'query') {
      openQueryFile(n.conn, n.file.name)
    }
  },
  onRename: (n, name) => {
    if (n.t === 'group') n.g.name = name
    else if (n.t === 'conn') n.c.conn.name = name
    else return
    saveSoon()
    void refresh()
  },
  onMove: moveDbNode,
  menu: (n) => {
    if (n.t === 'group') {
      return [
        { label: 'New connection…', run: () => openConnForm(n.g.id) },
        { label: 'New folder…', run: () => void addGroup(n.g.id) },
        { label: 'Rename…', run: () => void renameGroup(n.g) },
        {
          label: 'Delete',
          danger: true,
          run: () => {
            removeNode(n.g.id)
            saveSoon()
            void refresh()
          }
        }
      ]
    }
    if (n.t === 'conn') {
      return [
        { label: 'New query', run: () => openQueryEditor({ connId: n.c.conn.id }) },
        { label: 'Edit connection…', run: () => openConnForm(null, n.c) },
        { label: 'Rename…', run: () => void renameConn(n.c) },
        {
          label: 'Delete',
          danger: true,
          run: () => {
            removeNode(n.c.id)
            void window.crafterm.dbDisconnect(n.c.conn.id)
            saveSoon()
            void refresh()
          }
        }
      ]
    }
    if (n.t === 'section' && n.kind === 'Queries') {
      return [{ label: 'New query', run: () => openQueryEditor({ connId: n.conn.id }) }]
    }
    if (n.t === 'object') {
      return [
        {
          label: 'Preview (SELECT *)',
          run: () =>
            openQueryEditor({ connId: n.conn.id, sql: `SELECT * FROM ${n.name} LIMIT 100;`, run: true })
        }
      ]
    }
    if (n.t === 'query') {
      return [
        { label: 'Open', run: () => openQueryFile(n.conn, n.file.name) },
        { label: 'Delete', danger: true, run: () => deleteQuery(n.conn, n.file.name) }
      ]
    }
    return []
  }
}

function enginePillText(e: DbEngine): string {
  return e === 'postgres' ? 'PG' : e === 'mysql' ? 'SQL' : 'LITE'
}

let treeview: TreeView<DbTreeNode> | null = null

async function refresh(): Promise<void> {
  if (!container) return
  if (!settings.dbTree.length) {
    container.replaceChildren()
    container.insertAdjacentHTML(
      'beforeend',
      '<div class="empty-hint">No connections. Add a project, then a connection.</div>'
    )
    return
  }
  if (!treeview) treeview = createTreeView<DbTreeNode>(container, adapter)
  treeview.render(settings.dbTree.map(wrap))
}

// Reload a connection's saved-query list and re-render (after save/delete).
async function reloadQueries(connId: string): Promise<void> {
  queriesCache.set(connId, await window.crafterm.dbqList(connId))
  await refresh()
}

// ---- group create/rename ----

async function addGroup(parentId: string | null): Promise<void> {
  const name = await promptText({
    title: parentId ? 'New folder' : 'New project',
    label: 'Name',
    confirmText: 'Create'
  })
  if (!name) return
  const group: DbGroup = { kind: 'group', id: uid('dbg'), name, collapsed: false, children: [] }
  if (parentId) {
    findGroup(parentId)?.children.push(group)
    expanded.add(parentId)
  } else {
    settings.dbTree.push(group)
  }
  saveSoon()
  await refresh()
}

export function databaseNewProject(): void {
  void addGroup(null)
}

async function renameGroup(node: DbGroup): Promise<void> {
  const name = await promptText({ title: 'Rename', label: 'Name', value: node.name, confirmText: 'Rename' })
  if (!name) return
  node.name = name
  saveSoon()
  await refresh()
}

// ---- connection form ----

function openConnForm(parentGroupId: string | null, existing?: DbConnNode): void {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal db-conn-modal'
  overlay.appendChild(modal)
  const close = (): void => overlay.remove()
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  modal.appendChild(makeCloseButton(close))
  modal.insertAdjacentHTML('beforeend', `<h2>${existing ? 'Edit connection' : 'New connection'}</h2>`)

  const c = existing?.conn
  const field = (label: string, value: string, ph: string, type = 'text'): HTMLInputElement => {
    modal.insertAdjacentHTML('beforeend', `<div class="reminder-label">${label}</div>`)
    const i = document.createElement('input')
    i.className = 'reminder-input'
    i.type = type
    i.value = value
    i.placeholder = ph
    modal.appendChild(i)
    return i
  }

  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Engine</div>')
  let engineVal: DbEngine = c?.engine ?? 'postgres'
  const seg = document.createElement('div')
  seg.className = 'db-seg'
  const segBtns: HTMLButtonElement[] = []
  ;(
    [
      ['postgres', 'PostgreSQL'],
      ['mysql', 'MySQL'],
      ['sqlite', 'SQLite']
    ] as [DbEngine, string][]
  ).forEach(([v, lbl]) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.dataset.engine = v
    b.className = 'db-seg-btn ' + engineClass(v) + (v === engineVal ? ' active' : '')
    b.textContent = lbl
    b.addEventListener('click', () => {
      engineVal = v
      segBtns.forEach((x) => x.classList.toggle('active', x.dataset.engine === v))
      applyEngine()
    })
    segBtns.push(b)
    seg.appendChild(b)
  })
  modal.appendChild(seg)

  const name = field('Name', c?.name ?? '', 'movve-db-production')

  // network fields (postgres/mysql)
  const netWrap = document.createElement('div')
  modal.appendChild(netWrap)
  const host = document.createElement('input')
  const port = document.createElement('input')
  const user = document.createElement('input')
  const pass = document.createElement('input')
  const database = document.createElement('input')
  const sslLabel = document.createElement('label')
  const ssl = document.createElement('input')
  const mkNet = (label: string, input: HTMLInputElement, value: string, ph: string, type = 'text'): void => {
    netWrap.insertAdjacentHTML('beforeend', `<div class="reminder-label">${label}</div>`)
    input.className = 'reminder-input'
    input.type = type
    input.value = value
    input.placeholder = ph
    netWrap.appendChild(input)
  }
  mkNet('Host', host, c?.host ?? '', 'localhost')
  mkNet('Port', port, c?.port ? String(c.port) : '', '5432 / 3306', 'number')
  mkNet('User', user, c?.user ?? '', 'postgres')
  mkNet('Password', pass, c?.password ?? '', '••••••••', 'password')
  mkNet('Database', database, c?.database ?? '', 'mydb')
  sslLabel.className = 'checkbox-row'
  ssl.type = 'checkbox'
  ssl.checked = !!c?.ssl
  sslLabel.append(ssl, document.createTextNode('Use SSL'))
  netWrap.appendChild(sslLabel)

  // sqlite field
  const fileWrap = document.createElement('div')
  modal.appendChild(fileWrap)
  const file = document.createElement('input')
  fileWrap.insertAdjacentHTML('beforeend', '<div class="reminder-label">SQLite file</div>')
  file.className = 'reminder-input'
  file.value = c?.file ?? ''
  file.placeholder = '~/path/to/db.sqlite'
  fileWrap.appendChild(file)

  const applyEngine = (): void => {
    const sqlite = engineVal === 'sqlite'
    netWrap.style.display = sqlite ? 'none' : ''
    fileWrap.style.display = sqlite ? '' : 'none'
    port.placeholder = engineVal === 'mysql' ? '3306' : '5432'
  }
  applyEngine()

  const status = document.createElement('div')
  status.className = 'db-conn-status'
  modal.appendChild(status)

  const build = (): DbConnection => ({
    id: c?.id ?? uid('dbc'),
    name: name.value.trim() || 'connection',
    engine: engineVal,
    host: host.value.trim() || undefined,
    port: port.value ? parseInt(port.value, 10) : undefined,
    user: user.value.trim() || undefined,
    password: pass.value || undefined,
    database: database.value.trim() || undefined,
    ssl: ssl.checked || undefined,
    file: file.value.trim() || undefined
  })

  const actions = document.createElement('div')
  actions.className = 'modal-actions'
  const test = document.createElement('button')
  test.textContent = 'Test'
  test.addEventListener('click', () => {
    void (async () => {
      status.textContent = 'Testing…'
      status.className = 'db-conn-status'
      const r = await window.crafterm.dbConnect(build())
      status.textContent = r.ok ? 'Connected ✓' : `Failed: ${r.error}`
      status.className = 'db-conn-status ' + (r.ok ? 'ok' : 'err')
    })()
  })
  const save = document.createElement('button')
  save.className = 'primary'
  save.textContent = existing ? 'Save' : 'Add'
  save.addEventListener('click', () => {
    const conn = build()
    if (existing) {
      existing.conn = conn
      objCache.delete(conn.id)
    } else {
      const node: DbConnNode = { kind: 'conn', id: uid('dbn'), collapsed: false, conn }
      if (parentGroupId) {
        findGroup(parentGroupId)?.children.push(node)
        expanded.add(parentGroupId)
      } else {
        settings.dbTree.push(node)
      }
    }
    saveSoon()
    void refresh()
    close()
  })
  actions.append(test, save)
  modal.appendChild(actions)
  document.body.appendChild(overlay)
  name.focus()
}

// ---- query editor (run SQL → results grid, save as .sql) ----

function openQueryEditor(opts: { connId?: string; sql?: string; fileName?: string; run?: boolean }): void {
  const conns = flattenConns()
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal db-query-modal'
  overlay.appendChild(modal)
  const close = (): void => overlay.remove()
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  modal.appendChild(makeCloseButton(close))

  // toolbar: connection picker (with engine dot) + Run + Save
  const bar = document.createElement('div')
  bar.className = 'db-query-bar'
  const connWrap = document.createElement('div')
  connWrap.className = 'db-conn-select'
  const dot = document.createElement('span')
  dot.className = 'db-conn-dot'
  const connSel = document.createElement('select')
  connSel.className = 'settings-select'
  if (!conns.length) connSel.insertAdjacentHTML('beforeend', '<option value="">(no connections)</option>')
  for (const cn of conns) {
    const o = document.createElement('option')
    o.value = cn.conn.id
    o.textContent = `${cn.conn.name}  ·  ${engineLabel(cn.conn.engine)}`
    if (cn.conn.id === opts.connId) o.selected = true
    connSel.appendChild(o)
  }
  connWrap.append(dot, connSel)
  const runBtn = document.createElement('button')
  runBtn.className = 'primary db-run-btn'
  runBtn.innerHTML = PLAY_SVG + '<span>Run</span><kbd>⌘↵</kbd>'
  const saveBtn = document.createElement('button')
  saveBtn.className = 'db-save-btn'
  saveBtn.textContent = 'Save .sql'
  bar.append(connWrap, runBtn, saveBtn)
  modal.appendChild(bar)

  // editor (CodeMirror) host
  const editorHost = document.createElement('div')
  editorHost.className = 'db-query-editor'
  modal.appendChild(editorHost)

  // result: status bar + grid
  const result = document.createElement('div')
  result.className = 'db-result'
  modal.appendChild(result)
  result.innerHTML = '<div class="db-result-empty">Run a query to see results.</div>'

  let fileName = opts.fileName ?? ''
  const connOf = (): DbConnection | null => conns.find((c) => c.conn.id === connSel.value)?.conn ?? null

  const schemaFor = (conn: DbConnection): Record<string, string[]> => {
    const o = objCache.get(conn.id)
    const s: Record<string, string[]> = {}
    if (o) for (const t of [...o.tables, ...o.views]) s[t] = []
    return s
  }

  const initialConn = connOf()
  const editor = createSqlEditor({
    parent: editorHost,
    doc: opts.sql ?? '',
    engine: initialConn?.engine ?? 'postgres',
    onRun: () => void run()
  })
  if (initialConn) editor.setSchema(initialConn.engine, schemaFor(initialConn))

  const dotClass = (conn: DbConnection | null): void => {
    dot.className = 'db-conn-dot' + (conn ? ' ' + engineClass(conn.engine) : '')
  }
  dotClass(initialConn)

  // refresh dialect + autocomplete schema when the connection changes (fetch
  // objects lazily so table names show up in IntelliSense).
  const syncEditorTo = (conn: DbConnection): void => {
    dotClass(conn)
    editor.setSchema(conn.engine, schemaFor(conn))
    if (!objCache.has(conn.id)) {
      void (async () => {
        const o = await window.crafterm.dbObjects(conn)
        objCache.set(conn.id, o)
        editor.setSchema(conn.engine, schemaFor(conn))
      })()
    }
  }
  if (initialConn) syncEditorTo(initialConn)
  connSel.addEventListener('change', () => {
    const conn = connOf()
    if (conn) syncEditorTo(conn)
  })

  const run = async (): Promise<void> => {
    const conn = connOf()
    if (!conn) {
      result.innerHTML = '<div class="db-error">Pick a connection first.</div>'
      return
    }
    const sql = editor.getValue().trim()
    if (!sql) return
    result.innerHTML = '<div class="db-muted db-result-empty">Running…</div>'
    const t0 = performance.now()
    const res = await window.crafterm.dbQuery(conn, sql)
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
    renderGrid(result, res.columns, res.rows, ms)
  }

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
        value: fileName.replace(/\.sql$/i, ''),
        placeholder: 'daily-report',
        confirmText: 'Save'
      })
      if (!nm) return
      fileName = nm.endsWith('.sql') ? nm : nm + '.sql'
      await window.crafterm.dbqWrite(conn.id, fileName, editor.getValue())
      expanded.add(conn.id)
      subOpen.add(conn.id + ':Queries')
      await reloadQueries(conn.id)
    })()
  })

  document.body.appendChild(overlay)
  setTimeout(() => editor.focus(), 30)
  if (opts.run) void run()
}

function renderGrid(host: HTMLElement, columns: string[], rows: unknown[][], ms: number): void {
  host.replaceChildren()
  const status = document.createElement('div')
  status.className = 'db-result-status'
  const shown = Math.min(rows.length, 1000)
  status.innerHTML =
    `<span class="db-result-rows">${rows.length} row${rows.length === 1 ? '' : 's'}</span>` +
    (rows.length > shown ? `<span class="db-muted"> (showing ${shown})</span>` : '') +
    `<span class="db-result-ms">${ms}ms</span>`
  host.appendChild(status)

  const wrap = document.createElement('div')
  wrap.className = 'db-grid-wrap'
  const table = document.createElement('table')
  table.className = 'db-grid'
  const thead = document.createElement('thead')
  const htr = document.createElement('tr')
  const corner = document.createElement('th')
  corner.className = 'db-grid-rownum'
  corner.textContent = '#'
  htr.appendChild(corner)
  for (const col of columns) {
    const th = document.createElement('th')
    th.textContent = col
    htr.appendChild(th)
  }
  thead.appendChild(htr)
  table.appendChild(thead)
  const tbody = document.createElement('tbody')
  rows.slice(0, 1000).forEach((row, i) => {
    const tr = document.createElement('tr')
    const num = document.createElement('td')
    num.className = 'db-grid-rownum'
    num.textContent = String(i + 1)
    tr.appendChild(num)
    for (const cell of row) {
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
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  })
  table.appendChild(tbody)
  wrap.appendChild(table)
  host.appendChild(wrap)
}

// Driven by the shared sidebar search bar when Database mode is active.
export function dbApplyQuery(q: string): void {
  // simple: expand all matching groups/conns is out of scope; filter top-level by name
  void q
}
