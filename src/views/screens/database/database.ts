import { uid } from '@views/lib/uid'
import { el } from '@views/lib/dom'
import { dbTree } from '@models/db-tree'
import { persistence } from '@repositories/persistence.service'
import type { DbGroup, DbConnNode, DbConnection } from '@views/types/types'
import type { DbObjects } from '@services/db/db.types'
import { promptText } from '@views/components/dialog/prompt-text'
import { openSqlInSplit } from '@views/commands/commands'
import { createTreeView, type TreeAdapter, type TreeView, type DropPos } from '@views/components/treeview/treeview'
import './database.css'
import { dbService, dbqService } from '@services'
import { openConnectionForm } from './components/connection-form.open'
import { dbConnectionRepo } from '@repositories'
import { UITexts } from '@texts'
import type { DbSectionKind, DbTreeNode } from './database.types'
import {
  GROUP_SVG,
  DB_SVG,
  QUERY_SVG,
  engineClass,
  enginePillText,
  sectionGlyph,
  wrap,
  findGroup,
  removeNode,
  locate,
  containsId
} from './database.state'

// Database tool: a project/folder/connection tree in the sidebar, live object
// introspection under each connection, a Queries section of saved .sql files,
// and a query editor (run SQL → results grid, save as .sql). Imperative widget —
// plain DOM over the @views treeview port; gea reactivity buys nothing here
// (§2.7 self-contained, no @ui). The legacy entry re-exports these functions.

let container: HTMLElement | null = null
const expanded = new Set<string>() // group/conn ids
const subOpen = new Set<string>() // "<connId>:tables|views|procedures|queries"
const objCache = new Map<string, DbObjects>()
const queriesCache = new Map<string, { name: string; path: string }[]>()

// ---- rendering ----

export async function renderDatabase(host: HTMLElement): Promise<void> {
  container = host
  await refresh()
}

// Keyboard navigation, delegated from the sidebar when Database mode is active.
export function databaseHandleKey(e: KeyboardEvent): void {
  treeview?.handleKey(e)
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
  return el('span', { class: cls }, text)
}

// Load a connection's objects + saved queries the first time it's expanded.
function ensureConnLoaded(conn: DbConnection): void {
  if (objCache.has(conn.id)) return
  void (async () => {
    const [objs, queries] = await Promise.all([dbService.objects(conn), dbqService.list(conn.id)])
    objCache.set(conn.id, objs)
    queriesCache.set(conn.id, queries)
    void refresh()
  })()
}

async function renameConn(c: DbConnNode): Promise<void> {
  const name = await promptText({ title: UITexts.Database.renameTitle, label: UITexts.Database.fieldName, value: c.conn.name, confirmText: UITexts.Database.renameConfirm })
  if (!name) return
  c.conn.name = name
  dbConnectionRepo.update(c.conn)
  void refresh()
}

function deleteQuery(conn: DbConnection, fileName: string): void {
  void (async () => {
    await dbqService.delete(conn.id, fileName)
    await reloadQueries(conn.id)
  })()
}
function openQueryFile(conn: DbConnection, fileName: string): void {
  void (async () => {
    const sql = await dbqService.read(conn.id, fileName)
    openSqlInSplit({ connId: conn.id, sql, fileName })
  })()
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
    if (n.t === 'conn') return pill('database-engine-badge ' + engineClass(n.c.conn.engine), enginePillText(n.c.conn.engine))
    if (n.t === 'section') return pill('database-count-badge', String(sectionCount(n.conn, n.kind)))
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
        { label: UITexts.Database.menu.newConnection, run: () => openConnForm(n.g.id) },
        { label: UITexts.Database.menu.newFolder, run: () => void addGroup(n.g.id) },
        { label: UITexts.Database.menu.rename, run: () => void renameGroup(n.g) },
        {
          label: UITexts.Database.menu.delete,
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
        { label: UITexts.Database.menu.newQuery, run: () => openSqlInSplit({ connId: n.c.conn.id }) },
        { label: UITexts.Database.menu.editConnection, run: () => openConnForm(null, n.c) },
        { label: UITexts.Database.menu.rename, run: () => void renameConn(n.c) },
        {
          label: UITexts.Database.menu.delete,
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
      return [{ label: UITexts.Database.menu.newQuery, run: () => openSqlInSplit({ connId: n.conn.id }) }]
    }
    if (n.t === 'object') {
      return [
        {
          label: UITexts.Database.menu.preview,
          run: () =>
            openSqlInSplit({ connId: n.conn.id, sql: `SELECT * FROM ${n.name} LIMIT 100;`, autoRun: true })
        }
      ]
    }
    if (n.t === 'query') {
      return [
        { label: UITexts.Database.menu.open, run: () => openQueryFile(n.conn, n.file.name) },
        { label: UITexts.Database.menu.delete, danger: true, run: () => deleteQuery(n.conn, n.file.name) }
      ]
    }
    return []
  }
}

let treeview: TreeView<DbTreeNode> | null = null

async function refresh(): Promise<void> {
  if (!container) return
  if (!dbTree.length) {
    container.replaceChildren()
    container.appendChild(el('div', { class: 'empty-hint' }, 'No connections. Add a project, then a connection.'))
    return
  }
  if (!treeview) treeview = createTreeView<DbTreeNode>(container, adapter)
  treeview.render(dbTree.map(wrap))
}

// Reload a connection's saved-query list and re-render (after save/delete).
async function reloadQueries(connId: string): Promise<void> {
  queriesCache.set(connId, await dbqService.list(connId))
  await refresh()
}

// ---- group create/rename ----

async function addGroup(parentId: string | null): Promise<void> {
  const name = await promptText({
    title: parentId ? UITexts.Database.newFolderTitle : UITexts.Database.newProjectTitle,
    label: UITexts.Database.fieldName,
    confirmText: UITexts.Database.createConfirm
  })
  if (!name) return
  const group: DbGroup = { kind: 'group', id: uid('dbg'), name, collapsed: false, children: [] }
  if (parentId) {
    findGroup(parentId)?.children.push(group)
    expanded.add(parentId)
  } else {
    dbTree.push(group)
  }
  persistence.save()
  await refresh()
}

export function databaseNewProject(): void {
  void addGroup(null)
}

async function renameGroup(node: DbGroup): Promise<void> {
  const name = await promptText({ title: UITexts.Database.renameTitle, label: UITexts.Database.fieldName, value: node.name, confirmText: UITexts.Database.renameConfirm })
  if (!name) return
  node.name = name
  persistence.save()
  await refresh()
}

// ---- connection form ----

function openConnForm(parentGroupId: string | null, existing?: DbConnNode): void {
  openConnectionForm({
    existing,
    onSave: (conn) => {
      if (existing) {
        existing.conn = conn
        objCache.delete(conn.id)
      } else {
        const node: DbConnNode = { kind: 'conn', id: uid('dbn'), collapsed: false, conn }
        if (parentGroupId) {
          findGroup(parentGroupId)?.children.push(node)
          expanded.add(parentGroupId)
        } else {
          dbTree.push(node)
        }
      }
      persistence.save()
      void refresh()
    }
  })
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
