import type { NbNode } from '../../preload/api'
import { openNote, openMarkdownFile } from './commands'
import { promptText } from './dialog'
import { showFileFinder } from './pickers'
import { settings, saveSoon } from './state'
import { createTreeView, type TreeAdapter, type TreeView, type DropPos } from './treeview'
import { type ContextMenuItem } from './contextmenu'
import './notebook.css'

const FOLDER_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1.6 4.4c0-.6.4-1 1-1h3.1l1.2 1.4H13.4c.6 0 1 .4 1 1V11.6c0 .6-.4 1-1 1H2.6c-.6 0-1-.4-1-1z" fill="currentColor"/></svg>'
const NOTE_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 1.5h5l3 3v10H4z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M9 1.5v3h3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>'
const LINK_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6.5 9.5l3-3M5.5 7.5L4 9a2.1 2.1 0 0 0 3 3l1.5-1.5M10.5 8.5L12 7a2.1 2.1 0 0 0-3-3L7.5 5.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'

const MD_RE = /\.(md|mdx|mdc)$/i

let container: HTMLElement | null = null
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
    saveSoon()
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
  items.push({ label: 'Show in Finder', run: () => window.crafterm.nbReveal(n.path) })
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
      window.crafterm.nbReveal(n.path)
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

export async function renderNotebook(host: HTMLElement): Promise<void> {
  container = host
  host.replaceChildren()
  linkedHost = document.createElement('div')
  treeHost = document.createElement('div')
  treeHost.className = 'nb-tree'
  host.append(linkedHost, treeHost)
  treeview = createTreeView<NbNode>(treeHost, adapter)
  treeview.setFilter(nbQuery)
  await refresh()
}

async function refresh(): Promise<void> {
  if (!treeview || !linkedHost) return
  const tree = await window.crafterm.nbTree()
  renderLinked(linkedHost)
  treeview.render(tree)
  if (openPath) highlightActive()
}

// ---- search (driven by the shared sidebar search bar) -----------------------

export function nbApplyQuery(q: string): void {
  nbQuery = q
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
  else window.crafterm.openPath(path)
}

function unlink(path: string): void {
  settings.linkedFiles = settings.linkedFiles.filter((f) => f.path !== path)
  saveSoon()
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
        window.crafterm.openPath(f.path.slice(0, f.path.lastIndexOf('/')) || f.path)
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
        saveSoon()
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
  const ok = await window.crafterm.nbMove(src, destDir)
  if (!ok) return
  const newPath = joinPath(destDir, basename(src))
  moveColor(src, newPath)
  saveSoon()
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
  const ok = await window.crafterm.nbRename(node.path, name)
  if (!ok) return
  const newPath = joinPath(parentOf(node.path), name)
  moveColor(node.path, newPath)
  if (openPath === node.path) openPath = newPath
  saveSoon()
  await refresh()
}

async function renamePath(path: string, current: string): Promise<void> {
  const name = await promptText({ title: 'Rename', label: 'Name', value: current, confirmText: 'Rename' })
  if (!name || name === current) return
  const ok = await window.crafterm.nbRename(path, name)
  if (!ok) return
  const newPath = joinPath(parentOf(path), name)
  moveColor(path, newPath)
  if (openPath === path) openPath = newPath
  saveSoon()
  await refresh()
}

async function deleteNode(node: NbNode): Promise<void> {
  await window.crafterm.nbDelete(node.path)
  delete settings.notebookColors[node.path]
  saveSoon()
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
  await window.crafterm.nbMkdir(joinPath(parent, name))
  if (parent) expanded.add(parent)
  await refresh()
}

async function addNote(parent: string): Promise<void> {
  const name = await promptText({ title: 'New note', label: 'Name', placeholder: 'note', confirmText: 'Create' })
  if (!name) return
  const rel = joinPath(parent, name)
  await window.crafterm.nbCreate(rel)
  if (parent) expanded.add(parent)
  const notePath = MD_RE.test(rel) ? rel : rel + '.md'
  openPath = notePath
  selectedPath = notePath
  await refresh()
  openNote(notePath)
}
