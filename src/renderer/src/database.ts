import { settings, uid } from './state'
import { persistence } from './services/storage/persistence.service'
import type { DbNode, DbGroup, DbConnNode, DbConnection, DbEngine } from './types'
import type { DbObjects } from '../../preload/api'
import { makeCloseButton, promptText } from './dialog'
import { openSqlInSplit } from './commands'
import { createTreeView, type TreeAdapter, type TreeView, type DropPos } from '@crafterm/ui'
import './database.css'
import { dbService } from './services/ipc'
import { dbConnectionRepo } from './services/storage/repositories'

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

// ---- tree helpers (operate on settings.dbTree) ----

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

// Keyboard navigation, delegated from the sidebar when Database mode is active.
export function databaseHandleKey(e: KeyboardEvent): void {
  treeview?.handleKey(e)
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
      dbService.objects(conn),
      dbService.savedList(conn.id)
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
  dbConnectionRepo.update(c.conn)
  void refresh()
}

function deleteQuery(conn: DbConnection, fileName: string): void {
  void (async () => {
    await dbService.savedDelete(conn.id, fileName)
    await reloadQueries(conn.id)
  })()
}
function openQueryFile(conn: DbConnection, fileName: string): void {
  void (async () => {
    const sql = await dbService.savedRead(conn.id, fileName)
    openSqlInSplit({ connId: conn.id, sql, fileName })
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
  persistence.save()
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
    persistence.save()
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
      openSqlInSplit({ connId: n.conn.id, sql: `SELECT * FROM ${n.name} LIMIT 100;`, autoRun: true })
    } else if (n.t === 'query') {
      openQueryFile(n.conn, n.file.name)
    }
  },
  onRename: (n, name) => {
    if (n.t === 'group') {
      n.g.name = name
      persistence.save()
    } else if (n.t === 'conn') {
      n.c.conn.name = name
      dbConnectionRepo.update(n.c.conn)
    } else return
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
            persistence.save()
            void refresh()
          }
        }
      ]
    }
    if (n.t === 'conn') {
      return [
        { label: 'New query', run: () => openSqlInSplit({ connId: n.c.conn.id }) },
        { label: 'Edit connection…', run: () => openConnForm(null, n.c) },
        { label: 'Rename…', run: () => void renameConn(n.c) },
        {
          label: 'Delete',
          danger: true,
          run: () => {
            removeNode(n.c.id)
            void dbService.disconnect(n.c.conn.id)
            persistence.save()
            void refresh()
          }
        }
      ]
    }
    if (n.t === 'section' && n.kind === 'Queries') {
      return [{ label: 'New query', run: () => openSqlInSplit({ connId: n.conn.id }) }]
    }
    if (n.t === 'object') {
      return [
        {
          label: 'Preview (SELECT *)',
          run: () =>
            openSqlInSplit({ connId: n.conn.id, sql: `SELECT * FROM ${n.name} LIMIT 100;`, autoRun: true })
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
  queriesCache.set(connId, await dbService.savedList(connId))
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
  persistence.save()
  await refresh()
}

export function databaseNewProject(): void {
  void addGroup(null)
}

async function renameGroup(node: DbGroup): Promise<void> {
  const name = await promptText({ title: 'Rename', label: 'Name', value: node.name, confirmText: 'Rename' })
  if (!name) return
  node.name = name
  persistence.save()
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
      const r = await dbService.connect(build())
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
    persistence.save()
    void refresh()
    close()
  })
  actions.append(test, save)
  modal.appendChild(actions)
  document.body.appendChild(overlay)
  name.focus()
}

// Listen for save events from SQL panes so the connection's "Queries" list
// stays in sync with newly saved .sql files.
window.addEventListener('crafterm:dbq-changed', (ev) => {
  const detail = (ev as CustomEvent<{ connId: string }>).detail
  if (!detail?.connId) return
  expanded.add(detail.connId)
  subOpen.add(detail.connId + ':Queries')
  void reloadQueries(detail.connId)
})

// Driven by the shared sidebar search bar when Database mode is active.
// Forwards to the underlying treeview's contains-filter, which matches against
// every label currently in the tree — group/connection names plus any already-
// loaded objects (tables/views/queries) under expanded connections.
export function dbApplyQuery(q: string): void {
  treeview?.setFilter(q)
}
