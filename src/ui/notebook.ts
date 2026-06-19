import type { NbNode } from '@bridge/api'
import { openNote, openMarkdownFile } from './commands'
import { promptText } from './dialog'
import { showFileFinder } from './screens/pickers/finders/finders'
import { settings, state } from './state'
import { persistence } from './services/storage/persistence.service'
import { flattenProjects } from './catalog'
import { createTreeView, type TreeAdapter, type TreeView, type DropPos } from '@ui/components'
import { type ContextMenuItem } from '@ui/components'
import { showRemindModal } from './screens/reminders/reminders'
import { renderDailyCompact } from './screens/daily-plan/daily-plan'
import { renderMeetingNotes } from './screens/meeting-notes/meeting-notes'
import './notebook.css'
import { fsService, notebookService, plansService } from '@services'

const FOLDER_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1.6 4.4c0-.6.4-1 1-1h3.1l1.2 1.4H13.4c.6 0 1 .4 1 1V11.6c0 .6-.4 1-1 1H2.6c-.6 0-1-.4-1-1z" fill="currentColor"/></svg>'
const NOTE_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 1.5h5l3 3v10H4z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M9 1.5v3h3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>'
const LINK_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6.5 9.5l3-3M5.5 7.5L4 9a2.1 2.1 0 0 0 3 3l1.5-1.5M10.5 8.5L12 7a2.1 2.1 0 0 0-3-3L7.5 5.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'

const MD_RE = /\.(md|mdx|mdc)$/i

let container: HTMLElement | null = null
let planItems: { project: string; name: string; path: string; mtime: number }[] = []
let linkedHost: HTMLElement | null = null
let treeHost: HTMLElement | null = null
let treeview: TreeView<NbNode> | null = null
const expanded = new Set<string>()
let selectedPath: string | null = null
// The currently open note — gets the `.active` highlight, like the open terminal.
let openPath: string | null = null
let nbQuery = ''

function basename(p: string): string {
  return p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p
}
function parentOf(p: string): string {
  return p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
}
function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

// ---- TreeView adapter -------------------------------------------------------

const adapter: TreeAdapter<NbNode> = {
  id: (n) => n.path,
  label: (n) => (n.kind === 'file' ? n.name.replace(MD_RE, '') : n.name),
  icon: (n) => (n.kind === 'dir' ? FOLDER_SVG : NOTE_SVG),
  isContainer: (n) => n.kind === 'dir',
  children: (n) => n.children ?? [],
  collapsed: (n) => !expanded.has(n.path),
  rowClass: (n) => (n.path === openPath ? 'active' : ''),
  color: (n) => settings.notebookColors[n.path] ?? null,
  onColor: (n, c) => {
    if (c) settings.notebookColors[n.path] = c
    else delete settings.notebookColors[n.path]
    persistence.save()
    void refresh()
  },
  renamable: () => true,
  draggable: () => true,
  onToggle: (n) => toggleDir(n.path),
  onActivate: (n) => {
    if (n.kind === 'file') open(n.path)
  },
  onSelect: (n) => {
    selectedPath = n ? n.path : null
  },
  onRename: (n, name) => void doRename(n, name),
  onMove: (dragId, targetId, pos) => void doMove(dragId, targetId, pos),
  menu: (n) => buildMenu(n),
  hoverActions: (n) => buildActions(n)
}

function buildMenu(n: NbNode): ContextMenuItem[] {
  const items: ContextMenuItem[] = []
  if (n.kind === 'dir') {
    items.push({ label: 'New note', run: () => void addNote(n.path) })
    items.push({ label: 'New folder', run: () => void addFolder(n.path) })
  }
  items.push({ label: 'Show in Finder', run: () => notebookService.reveal(n.path) })
  items.push({
    label: 'Remind me…',
    run: () =>
      showRemindModal(
        n.kind === 'file' ? n.name.replace(MD_RE, '') : n.name,
        `Notebook: ${n.kind === 'file' ? n.name.replace(MD_RE, '') : n.name}`,
        { kind: 'notebook', path: n.path }
      )
  })
  items.push({ label: 'Rename', run: () => void renamePath(n.path, n.name) })
  items.push({ label: 'Delete', run: () => void deleteNode(n), danger: true })
  return items
}

function buildActions(n: NbNode): HTMLElement {
  const actions = document.createElement('span')
  actions.className = 'nb-actions'
  if (n.kind === 'dir') {
    actions.append(
      actBtn('＋', 'New note', (e) => {
        e.stopPropagation()
        void addNote(n.path)
      }),
      actBtn('🗀', 'New folder', (e) => {
        e.stopPropagation()
        void addFolder(n.path)
      })
    )
  }
  actions.append(
    actBtn('⤴', 'Show in Finder', (e) => {
      e.stopPropagation()
      notebookService.reveal(n.path)
    }),
    actBtn('✎', 'Rename', (e) => {
      e.stopPropagation()
      void renamePath(n.path, n.name)
    }),
    actBtn('✕', 'Delete', (e) => {
      e.stopPropagation()
      void deleteNode(n)
    })
  )
  return actions
}

function actBtn(text: string, title: string, fn: (e: MouseEvent) => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.className = 'nb-act'
  b.textContent = text
  b.title = title
  b.addEventListener('click', fn)
  return b
}

// ---- rendering --------------------------------------------------------------

export type NbSubTab = 'notes' | 'plans' | 'daily' | 'meeting'
let nbSubTab: NbSubTab = 'notes'
export function notebookSubTab(): NbSubTab {
  return nbSubTab
}

// Hide the notes-only chrome (search box + footer) when the Daily Plan or
// Meeting Notes sub-tab is active.
function applySubTabChrome(): void {
  const app = document.getElementById('app')
  if (!app) return
  app.classList.toggle('nb-sub-notes', nbSubTab === 'notes')
  app.classList.toggle('nb-sub-other', nbSubTab !== 'notes')
}

export async function renderNotebook(host: HTMLElement): Promise<void> {
  container = host
  host.replaceChildren()

  const subtabs = document.createElement('div')
  subtabs.className = 'nb-subtabs'
  const mk = (key: NbSubTab, label: string): void => {
    const b = document.createElement('button')
    b.className = 'nb-subtab' + (nbSubTab === key ? ' active' : '')
    b.textContent = label
    b.addEventListener('click', () => {
      if (nbSubTab === key) return
      nbSubTab = key
      void renderNotebook(host)
    })
    subtabs.appendChild(b)
  }
  mk('notes', 'Notes')
  mk('plans', 'Plans')
  mk('daily', 'Daily Plan')
  mk('meeting', 'Meeting Notes')
  host.appendChild(subtabs)

  const body = document.createElement('div')
  body.className = 'nb-subtab-body'
  host.appendChild(body)
  applySubTabChrome()

  if (nbSubTab === 'plans') {
    await renderPlansTab(body)
    return
  }
  if (nbSubTab === 'daily') {
    renderDailyCompact(body)
    return
  }
  if (nbSubTab === 'meeting') {
    renderMeetingNotes(body)
    return
  }

  // Notes: in-page search (same position as the other sub-tabs) + scrollable tree.
  const search = document.createElement('input')
  search.type = 'text'
  search.className = 'nb-subtab-search'
  search.placeholder = 'Search notes…'
  search.value = nbQuery
  search.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Escape' && nbQuery) {
      search.value = ''
      nbApplyQuery('')
    }
  })
  search.addEventListener('input', () => nbApplyQuery(search.value))
  body.appendChild(search)

  const scroll = document.createElement('div')
  scroll.className = 'nb-notes-scroll'
  linkedHost = document.createElement('div')
  treeHost = document.createElement('div')
  treeHost.className = 'nb-tree'
  scroll.append(linkedHost, treeHost)
  body.appendChild(scroll)
  treeview = createTreeView<NbNode>(treeHost, adapter)
  treeview.setFilter(nbQuery)
  await refresh()
}

async function refresh(): Promise<void> {
  if (!treeview || !linkedHost) return
  const tree = await notebookService.tree()
  renderLinked(linkedHost)
  treeview.render(tree)
  if (openPath) highlightActive()
}

// ---- "Plans" tab: every docs/plans markdown, grouped by project ---------------

// Dedicated in-page search query for the Plans tab (independent of the Notes
// shared search box).
let plansQuery = ''

async function renderPlansTab(host: HTMLElement): Promise<void> {
  host.replaceChildren()
  host.classList.add('nb-plans-tab')

  const search = document.createElement('input')
  search.type = 'text'
  search.className = 'nb-subtab-search'
  search.placeholder = 'Search plans…'
  search.value = plansQuery
  search.addEventListener('keydown', (e) => e.stopPropagation())
  host.appendChild(search)

  const listHost = document.createElement('div')
  listHost.className = 'nb-plans-list'
  host.appendChild(listHost)

  // Scan once per render; the file watcher (onPlansChanged) drives refreshes.
  const paths = flattenProjects(state.tree)
    .map((p) => p.path)
    .filter((p): p is string => !!p && p.trim().length > 0)
  try {
    planItems = await plansService.scan(paths)
  } catch {
    planItems = []
  }

  search.addEventListener('input', () => {
    plansQuery = search.value
    renderPlansGroups(listHost)
  })
  renderPlansGroups(listHost)
}

// Render the plans grouped by project (newest-first within each group).
function renderPlansGroups(host: HTMLElement): void {
  host.replaceChildren()
  const q = plansQuery.trim().toLowerCase()
  const items = q
    ? planItems.filter(
        (p) => p.name.toLowerCase().includes(q) || p.project.toLowerCase().includes(q)
      )
    : planItems

  if (!items.length) {
    const empty = document.createElement('div')
    empty.className = 'nb-plans-empty'
    empty.textContent = q ? 'No matching plans' : 'No plans yet'
    host.appendChild(empty)
    return
  }

  // Group by project, preserving first-seen (newest-first) order.
  const groups = new Map<string, typeof planItems>()
  for (const p of items) {
    const g = groups.get(p.project) ?? []
    g.push(p)
    groups.set(p.project, g)
  }

  for (const [project, plans] of groups) {
    const section = document.createElement('div')
    section.className = 'nb-plans-group'
    const head = document.createElement('div')
    head.className = 'nb-linked-head'
    head.textContent = `${project} · ${plans.length}`
    section.appendChild(head)
    for (const p of plans) section.appendChild(renderPlanRow(p))
    host.appendChild(section)
  }
}

function renderPlanRow(p: { project: string; name: string; path: string; mtime: number }): HTMLElement {
  const row = document.createElement('div')
  row.className = 'tab-item nb-linked-row'
  row.title = p.path
  const top = document.createElement('div')
  top.className = 'tab-row'
  const icon = document.createElement('span')
  icon.className = 'folder-icon'
  icon.innerHTML = NOTE_SVG
  const name = document.createElement('span')
  name.className = 'tab-title'
  name.textContent = p.name.replace(MD_RE, '')
  const actions = document.createElement('span')
  actions.className = 'nb-actions'
  actions.append(
    actBtn('⏰', 'Remind me', (e) => {
      e.stopPropagation()
      showRemindModal(p.name.replace(MD_RE, ''), `Plan: ${p.name}`, { kind: 'plan', path: p.path })
    }),
    actBtn('⤴', 'Show in Finder', (e) => {
      e.stopPropagation()
      fsService.revealPath(p.path)
    })
  )
  top.append(icon, name, actions)
  row.appendChild(top)
  row.addEventListener('click', () => openMarkdownFile(p.path))
  return row
}

// ---- search (driven by the shared sidebar search bar) -----------------------

export function nbApplyQuery(q: string): void {
  nbQuery = q
  if (nbSubTab !== 'notes') return // shared search box only applies to the Notes tree
  treeview?.setFilter(q)
  if (linkedHost) renderLinked(linkedHost)
}
export function nbClearQuery(): void {
  nbQuery = ''
}
export function notebookSelectFirst(): void {
  treeview?.selectFirst()
}

// ---- "Linked files" section (external files outside the notebook folder) -----

function openLinked(path: string): void {
  if (MD_RE.test(path)) openMarkdownFile(path)
  else fsService.openPath(path)
}

function unlink(path: string): void {
  settings.linkedFiles = settings.linkedFiles.filter((f) => f.path !== path)
  persistence.save()
  void refresh()
}

function renderLinked(host: HTMLElement): void {
  host.replaceChildren()
  const q = nbQuery.trim().toLowerCase()
  const items = q
    ? settings.linkedFiles.filter((f) => f.name.toLowerCase().includes(q))
    : settings.linkedFiles
  if (!items.length) return
  const section = document.createElement('div')
  section.className = 'nb-linked'
  const head = document.createElement('div')
  head.className = 'nb-linked-head'
  head.textContent = 'Linked files'
  section.appendChild(head)
  for (const f of items) {
    const row = document.createElement('div')
    row.className = 'tab-item nb-linked-row'
    row.title = f.path
    const top = document.createElement('div')
    top.className = 'tab-row'
    const icon = document.createElement('span')
    icon.className = 'folder-icon'
    icon.innerHTML = LINK_SVG
    const name = document.createElement('span')
    name.className = 'tab-title'
    name.textContent = MD_RE.test(f.name) ? f.name.replace(MD_RE, '') : f.name
    const actions = document.createElement('span')
    actions.className = 'nb-actions'
    actions.append(
      actBtn('⤴', 'Show in Finder', (e) => {
        e.stopPropagation()
        fsService.openPath(f.path.slice(0, f.path.lastIndexOf('/')) || f.path)
      }),
      actBtn('✕', 'Unlink', (e) => {
        e.stopPropagation()
        unlink(f.path)
      })
    )
    top.append(icon, name, actions)
    row.appendChild(top)
    row.addEventListener('click', () => openLinked(f.path))
    section.appendChild(row)
  }
  host.appendChild(section)
}

// Cmd+O in Notebook: search files under the configured folders and link the
// chosen one into the tree (so out-of-project files can be opened from here).
export function notebookLinkFile(): void {
  void showFileFinder({
    title: 'Link file to notebook',
    onPick: (path, name) => {
      if (!settings.linkedFiles.some((f) => f.path === path)) {
        settings.linkedFiles.push({ path, name })
        persistence.save()
        void refresh()
      }
    }
  })
}

// ---- node operations --------------------------------------------------------

function toggleDir(path: string): void {
  if (expanded.has(path)) expanded.delete(path)
  else expanded.add(path)
  void refresh()
}

function open(path: string): void {
  openPath = path
  selectedPath = path
  treeview?.select(path)
  highlightActive()
  openNote(path)
}

function highlightActive(): void {
  treeHost?.querySelectorAll<HTMLElement>('.tab-item[data-tree-id]').forEach((el) => {
    el.classList.toggle('active', el.dataset.treeId === openPath)
  })
}

// Move the persisted color tag when a node's path changes (rename / move).
function moveColor(from: string, to: string): void {
  const col = settings.notebookColors[from]
  if (!col) return
  delete settings.notebookColors[from]
  settings.notebookColors[to] = col
}

async function doMove(src: string, targetId: string, pos: DropPos): Promise<void> {
  const destDir = pos === 'inside' ? targetId : parentOf(targetId)
  if (destDir === parentOf(src) && pos !== 'inside') return // same folder, no-op
  const ok = await notebookService.move(src, destDir)
  if (!ok) return
  const newPath = joinPath(destDir, basename(src))
  moveColor(src, newPath)
  persistence.save()
  if (destDir) expanded.add(destDir)
  await refresh()
}

async function doRename(node: NbNode, rawName: string): Promise<void> {
  // Keep the file extension the label hides (the label is shown without it).
  let name = rawName
  if (node.kind === 'file' && !MD_RE.test(name)) {
    const ext = node.name.match(MD_RE)?.[0] ?? '.md'
    name = name + ext
  }
  const ok = await notebookService.rename(node.path, name)
  if (!ok) return
  const newPath = joinPath(parentOf(node.path), name)
  moveColor(node.path, newPath)
  if (openPath === node.path) openPath = newPath
  persistence.save()
  await refresh()
}

async function renamePath(path: string, current: string): Promise<void> {
  const name = await promptText({ title: 'Rename', label: 'Name', value: current, confirmText: 'Rename' })
  if (!name || name === current) return
  const ok = await notebookService.rename(path, name)
  if (!ok) return
  const newPath = joinPath(parentOf(path), name)
  moveColor(path, newPath)
  if (openPath === path) openPath = newPath
  persistence.save()
  await refresh()
}

async function deleteNode(node: NbNode): Promise<void> {
  await notebookService.delete(node.path)
  delete settings.notebookColors[node.path]
  persistence.save()
  await refresh()
}

// ---- keyboard + create shortcuts (delegated from the sidebar) ---------------

export function handleNotebookKey(e: KeyboardEvent): void {
  treeview?.handleKey(e)
}

function contextDir(): string {
  if (!selectedPath) return ''
  const nodes = treeview?.visibleNodes() ?? []
  const cur = nodes.find((n) => n.path === selectedPath)
  if (!cur) return ''
  return cur.kind === 'dir' ? cur.path : parentOf(cur.path)
}
export function notebookNewNote(): void {
  void addNote(contextDir())
}
export function notebookNewFolder(): void {
  void addFolder(contextDir())
}

export function notebookRenameSelected(): void {
  if (!selectedPath) return
  void renamePath(selectedPath, basename(selectedPath))
}

async function addFolder(parent: string): Promise<void> {
  const name = await promptText({ title: 'New folder', label: 'Name', confirmText: 'Create' })
  if (!name) return
  await notebookService.mkdir(joinPath(parent, name))
  if (parent) expanded.add(parent)
  await refresh()
}

async function addNote(parent: string): Promise<void> {
  const name = await promptText({ title: 'New note', label: 'Name', placeholder: 'note', confirmText: 'Create' })
  if (!name) return
  const rel = joinPath(parent, name)
  await notebookService.create(rel)
  if (parent) expanded.add(parent)
  const notePath = MD_RE.test(rel) ? rel : rel + '.md'
  openPath = notePath
  selectedPath = notePath
  await refresh()
  openNote(notePath)
}
