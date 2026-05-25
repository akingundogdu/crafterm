import type { NbNode } from '../../preload/api'
import { openNote, openMarkdownFile } from './commands'
import { promptText } from './dialog'
import { showFileFinder } from './pickers'
import { settings, saveSoon } from './state'

const FOLDER_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1.6 4.4c0-.6.4-1 1-1h3.1l1.2 1.4H13.4c.6 0 1 .4 1 1V11.6c0 .6-.4 1-1 1H2.6c-.6 0-1-.4-1-1z" fill="currentColor"/></svg>'
const NOTE_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 1.5h5l3 3v10H4z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M9 1.5v3h3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>'
const LINK_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6.5 9.5l3-3M5.5 7.5L4 9a2.1 2.1 0 0 0 3 3l1.5-1.5M10.5 8.5L12 7a2.1 2.1 0 0 0-3-3L7.5 5.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'
// same chevron + tree-guide structure as the terminal sidebar
const CHEVRON_SVG =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const INDENT = 14

function buildGuides(depth: number, guides: boolean[], isLast: boolean): HTMLElement | null {
  if (depth === 0) return null
  const wrap = document.createElement('div')
  wrap.className = 'row-guides'
  const guideX = (level: number): number => 10 + level * INDENT + 7
  for (let level = 0; level < depth - 1; level++) {
    if (!guides[level]) continue
    const line = document.createElement('span')
    line.className = 'guide-line'
    line.style.left = guideX(level) + 'px'
    wrap.appendChild(line)
  }
  const elbow = document.createElement('span')
  elbow.className = 'guide-elbow' + (isLast ? ' last' : '')
  elbow.style.left = guideX(depth - 1) + 'px'
  wrap.appendChild(elbow)
  return wrap
}

let container: HTMLElement | null = null
const expanded = new Set<string>()
let selectedPath: string | null = null
// The currently open note — gets the same `.active` highlight as the open
// terminal tab, while `selectedPath` is the keyboard cursor (`.selected`).
let openPath: string | null = null
let flat: { path: string; kind: 'dir' | 'file' }[] = []
let nbQuery = ''

// Driven by the shared sidebar search bar when Notebook mode is active.
export function nbApplyQuery(q: string): void {
  nbQuery = q
  void refresh()
}
export function nbClearQuery(): void {
  nbQuery = ''
}
export function notebookSelectFirst(): void {
  if (!flat.length) return
  selectedPath = flat[0].path
  highlightSelected()
  scrollSelected()
}

// keep only nodes matching the query (by name) plus their ancestor folders
function pruneTree(nodes: NbNode[], q: string): NbNode[] {
  const out: NbNode[] = []
  for (const n of nodes) {
    if (n.kind === 'file') {
      if (n.name.toLowerCase().includes(q)) out.push(n)
    } else {
      const kids = n.children ? pruneTree(n.children, q) : []
      if (n.name.toLowerCase().includes(q) || kids.length) out.push({ ...n, children: kids })
    }
  }
  return out
}

export async function renderNotebook(host: HTMLElement): Promise<void> {
  container = host
  await refresh()
}

async function refresh(): Promise<void> {
  if (!container) return
  const host = container
  host.replaceChildren()

  const tree = await window.crafterm.nbTree()
  flat = []
  const q = nbQuery.trim().toLowerCase()
  renderLinkedSection(host, q)
  const data = q ? pruneTree(tree, q) : tree
  const treeEl = document.createElement('div')
  treeEl.className = 'nb-tree'
  if (!data.length) {
    treeEl.insertAdjacentHTML(
      'beforeend',
      `<div class="empty-hint">${q ? 'No matches' : 'No notes yet. Add a folder or note.'}</div>`
    )
  } else {
    renderNodes(data, treeEl, 0, [], !!q)
  }
  host.appendChild(treeEl)
  if (selectedPath && !flat.some((f) => f.path === selectedPath)) selectedPath = null
  if (openPath && !flat.some((f) => f.path === openPath)) openPath = null
}

const MD_RE = /\.(md|mdx|mdc)$/i

// Open a linked external file: markdown in the in-app viewer, anything else in
// the OS default app.
function openLinked(path: string): void {
  if (MD_RE.test(path)) openMarkdownFile(path)
  else window.crafterm.openPath(path)
}

function unlink(path: string): void {
  settings.linkedFiles = settings.linkedFiles.filter((f) => f.path !== path)
  saveSoon()
  void refresh()
}

// "Linked files" group at the top of the notebook tree: external files (outside
// the notebook folder) the user pinned via the file finder.
function renderLinkedSection(host: HTMLElement, q: string): void {
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

// Mirrors the terminal sidebar row structure (.tab-item / tree guides / chevron).
function renderNodes(
  nodes: NbNode[],
  parent: HTMLElement,
  depth: number,
  guides: boolean[],
  forceExpand: boolean
): void {
  nodes.forEach((node, i) => {
    const isLast = i === nodes.length - 1
    flat.push({ path: node.path, kind: node.kind })

    const row = document.createElement('div')
    row.className =
      'tab-item' +
      (node.kind === 'dir' ? ' folder' : '') +
      (node.path === openPath ? ' active' : '') +
      (node.path === selectedPath ? ' selected' : '')
    row.dataset.path = node.path
    row.style.paddingLeft = 10 + depth * INDENT + 'px'
    const g = buildGuides(depth, guides, isLast)
    if (g) row.appendChild(g)

    const top = document.createElement('div')
    top.className = 'tab-row'

    const icon = document.createElement('span')
    icon.className = 'folder-icon'
    const name = document.createElement('span')
    name.className = 'tab-title'
    name.textContent = node.kind === 'file' ? node.name.replace(/\.(md|mdx|mdc)$/i, '') : node.name

    const actions = document.createElement('span')
    actions.className = 'nb-actions'

    if (node.kind === 'dir') {
      const open = forceExpand || expanded.has(node.path)
      const tri = document.createElement('span')
      tri.className = 'tri' + (open ? ' expanded' : '')
      tri.innerHTML = CHEVRON_SVG
      tri.addEventListener('click', (e) => {
        e.stopPropagation()
        selectedPath = node.path
        toggleDir(node.path)
      })
      icon.innerHTML = FOLDER_SVG
      top.append(tri, icon, name)
      row.addEventListener('click', () => {
        selectedPath = node.path
        toggleDir(node.path)
      })
      actions.append(
        actBtn('＋', 'New note', (e) => {
          e.stopPropagation()
          void addNote(node.path)
        }),
        actBtn('🗀', 'New folder', (e) => {
          e.stopPropagation()
          void addFolder(node.path)
        })
      )
    } else {
      icon.innerHTML = NOTE_SVG
      top.append(icon, name)
      row.addEventListener('click', () => open(node.path))
    }
    actions.append(
      actBtn('⤴', 'Show in Finder', (e) => {
        e.stopPropagation()
        window.crafterm.nbReveal(node.path)
      }),
      actBtn('✎', 'Rename', (e) => {
        e.stopPropagation()
        void renameNode(node)
      }),
      actBtn('✕', 'Delete', (e) => {
        e.stopPropagation()
        void deleteNode(node)
      })
    )
    top.append(actions)
    row.appendChild(top)
    parent.appendChild(row)

    if (node.kind === 'dir' && (forceExpand || expanded.has(node.path)) && node.children) {
      renderNodes(node.children, parent, depth + 1, [...guides, !isLast], forceExpand)
    }
  })
}

function toggleDir(path: string): void {
  if (expanded.has(path)) expanded.delete(path)
  else expanded.add(path)
  void refresh()
}

// Open a note and mark it active (the blue highlight, like the open terminal).
function open(path: string): void {
  openPath = path
  selectedPath = path
  highlightSelected()
  openNote(path)
}

function actBtn(text: string, title: string, fn: (e: MouseEvent) => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.className = 'nb-act'
  b.textContent = text
  b.title = title
  b.addEventListener('click', fn)
  return b
}

function highlightSelected(): void {
  if (!container) return
  container.querySelectorAll<HTMLElement>('.tab-item[data-path]').forEach((el) => {
    el.classList.toggle('selected', el.dataset.path === selectedPath)
    el.classList.toggle('active', el.dataset.path === openPath)
  })
}

function scrollSelected(): void {
  container
    ?.querySelector<HTMLElement>(`.tab-item[data-path="${CSS.escape(selectedPath ?? '')}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}

function parentOf(p: string): string {
  return p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
}

// Keyboard navigation (delegated from the sidebar when Notebook is active).
export function handleNotebookKey(e: KeyboardEvent): void {
  if (!flat.length) return
  let idx = flat.findIndex((f) => f.path === selectedPath)
  const cur = idx >= 0 ? flat[idx] : null
  const move = (d: number): void => {
    if (idx < 0) idx = d > 0 ? -1 : 0
    const next = Math.max(0, Math.min(flat.length - 1, idx + d))
    selectedPath = flat[next].path
    highlightSelected()
    scrollSelected()
  }
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      move(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      move(-1)
      break
    case 'ArrowRight':
      e.preventDefault()
      if (cur?.kind === 'dir' && !expanded.has(cur.path)) {
        expanded.add(cur.path)
        void refresh()
      } else move(1)
      break
    case 'ArrowLeft':
      e.preventDefault()
      if (cur?.kind === 'dir' && expanded.has(cur.path)) {
        expanded.delete(cur.path)
        void refresh()
      } else if (cur && parentOf(cur.path)) {
        selectedPath = parentOf(cur.path)
        highlightSelected()
        scrollSelected()
      }
      break
    case 'Enter':
      e.preventDefault()
      if (cur?.kind === 'file') open(cur.path)
      else if (cur?.kind === 'dir') {
        if (expanded.has(cur.path)) expanded.delete(cur.path)
        else expanded.add(cur.path)
        void refresh()
      }
      break
  }
}

// Cmd+N / Cmd+Shift+N: create at the selected folder (or its parent / root).
function contextDir(): string {
  const f = selectedPath ? flat.find((x) => x.path === selectedPath) : null
  if (!f) return ''
  return f.kind === 'dir' ? f.path : parentOf(f.path)
}
export function notebookNewNote(): void {
  void addNote(contextDir())
}
export function notebookNewFolder(): void {
  void addFolder(contextDir())
}

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
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
  const notePath = /\.(md|mdx|mdc)$/i.test(rel) ? rel : rel + '.md'
  openPath = notePath
  selectedPath = notePath
  await refresh()
  openNote(notePath)
}

async function renameNode(node: NbNode): Promise<void> {
  await renamePath(node.path, node.name)
}

async function renamePath(path: string, current: string): Promise<void> {
  const name = await promptText({ title: 'Rename', label: 'Name', value: current, confirmText: 'Rename' })
  if (!name || name === current) return
  await window.crafterm.nbRename(path, name)
  await refresh()
}

// Rename the currently selected notebook node. Used by the Cmd+Shift+R shortcut.
export function notebookRenameSelected(): void {
  if (!selectedPath || !flat.some((x) => x.path === selectedPath)) return
  const current = selectedPath.split('/').pop() || ''
  void renamePath(selectedPath, current)
}

async function deleteNode(node: NbNode): Promise<void> {
  await window.crafterm.nbDelete(node.path)
  await refresh()
}
