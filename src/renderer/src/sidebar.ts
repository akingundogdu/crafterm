import type { SidebarNode, TabNode, FolderNode, ProjectNode, PaneStatus } from './types'
import { state, panes, settings, saveSoon } from './state'
import {
  collectPinnedRoots,
  allTabs,
  panesInLayout,
  firstPaneOf,
  ancestorFolders,
  findById,
  isContainer
} from './tree'
import { paneStatus } from './pane'
import {
  selectTab,
  selectPane,
  selectNode,
  openMarkdownFile,
  closeTab,
  togglePin,
  toggleCollapse,
  setAllFoldersCollapsed,
  anyFolderExpanded,
  toggleTabDetails,
  deleteFolder,
  newTab,
  newClaudeTab,
  newFolder,
  openTerminalRunning,
  contextFolderId,
  setNodeColor,
  setNodeName,
  autoNameTab,
  moveNode,
  setNodeGroup,
  type DropMode
} from './commands'
import {
  showPlansModal,
  showCommandHistory,
  showProjectPicker,
  showClaudeDashboard,
  showWorktreeDashboard,
  showCommandPalette,
  showSshConnections,
  showClaudeAccountSwitcher,
  showClaudeSessionResume,
  showRunApps,
  showFeatureSetup,
  runUpdate
} from './pickers'
import { findProjectByPath } from './catalog'
import { showImproveModal } from './improve'
import { promptText } from './dialog'
import { renderDatabase } from './database'
import { showContextMenu, type ContextMenuItem } from './contextmenu'
import {
  renderNotebook,
  handleNotebookKey,
  nbApplyQuery,
  nbClearQuery,
  notebookSelectFirst
} from './notebook'

const appEl = document.getElementById('app')!
const sidebarEl = document.getElementById('sidebar')!
const tabListEl = document.getElementById('tab-list')!
const searchInputEl = document.getElementById('search-input') as HTMLInputElement

let searchQuery = ''
searchInputEl.addEventListener('input', () => {
  if (sidebarMode === 'notebook') nbApplyQuery(searchInputEl.value)
  else {
    searchQuery = searchInputEl.value
    renderSidebar()
  }
})
searchInputEl.addEventListener('keydown', (e) => {
  e.stopPropagation()
  if (e.key === 'Escape') {
    searchInputEl.value = ''
    if (sidebarMode === 'notebook') nbApplyQuery('')
    else {
      searchQuery = ''
      renderSidebar()
    }
    searchInputEl.blur()
  } else if (e.key === 'ArrowDown') {
    // step from the search box into the result list
    e.preventDefault()
    focusList()
    if (sidebarMode === 'notebook') notebookSelectFirst()
    else if (liveRows.length) {
      selectNode(liveRows[0].node.id)
      scrollSelectedIntoView()
    }
  }
})

export function focusSearch(): void {
  searchInputEl.focus()
  searchInputEl.select()
}

// ---------------------------------------------------------------------------
// Collapsible sidebar (toggle icon / Cmd+B)
// ---------------------------------------------------------------------------

export function applySidebarCollapsed(): void {
  appEl.classList.toggle('sidebar-collapsed', settings.sidebar.collapsed ?? false)
}

export function toggleSidebar(): void {
  settings.sidebar.collapsed = !(settings.sidebar.collapsed ?? false)
  applySidebarCollapsed()
  saveSoon()
}

document.getElementById('sidebar-hide')!.addEventListener('click', toggleSidebar)
document.getElementById('sidebar-show')!.addEventListener('click', toggleSidebar)

// One button toggles every folder: if any is open, collapse all; else expand all.
document.getElementById('toggle-all-folders')!.addEventListener('click', () => {
  setAllFoldersCollapsed(anyFolderExpanded())
})

const sidebarActionsEl = document.getElementById('sidebar-actions')!
sidebarActionsEl.addEventListener('click', (e) => {
  e.stopPropagation()
  showActionsMenu(sidebarActionsEl)
})

function showActionsMenu(anchor: HTMLElement): void {
  document.querySelector('.context-menu')?.remove()
  const menu = document.createElement('div')
  menu.className = 'context-menu'
  const r = anchor.getBoundingClientRect()
  menu.style.left = Math.min(r.left, window.innerWidth - 200) + 'px'
  menu.style.top = r.bottom + 4 + 'px'
  const addItem = (label: string, fn: () => void): void => {
    const b = document.createElement('button')
    b.textContent = label
    b.addEventListener('click', () => {
      menu.remove()
      fn()
    })
    menu.appendChild(b)
  }
  addItem('Open project…', () => showProjectPicker(contextFolderId()))
  addItem('Commands palette', () => void showCommandPalette())
  addItem('Claude sessions', () => showClaudeDashboard())
  addItem('Resume Claude session', () => void showClaudeSessionResume())
  addItem('Switch Claude account', () => void showClaudeAccountSwitcher())
  addItem('Worktrees', () => void showWorktreeDashboard())
  addItem('My SSH connections', () => showSshConnections())
  addItem('Show all plans', () => void showPlansModal())
  addItem('Command history', () => showCommandHistory())
  addItem('Update my zsh config', () => void openTerminalRunning(settings.commands.openMyZsh, 'zsh config'))
  addItem('Improve Crafterm', () => void showImproveModal())
  addItem('Update Crafterm', () => void runUpdate())
  document.body.appendChild(menu)
  const onDown = (ev: MouseEvent): void => {
    if (!menu.contains(ev.target as Node)) {
      menu.remove()
      document.removeEventListener('mousedown', onDown, true)
    }
  }
  setTimeout(() => document.addEventListener('mousedown', onDown, true))
}

// ---------------------------------------------------------------------------
// Keyboard navigation (arrow keys move through the sidebar without the mouse)
// ---------------------------------------------------------------------------

function selectedNode(): SidebarNode | null {
  return liveRows.find((r) => r.node.id === state.selectedNodeId)?.node ?? null
}

function focusList(): void {
  tabListEl.focus()
}

function scrollSelectedIntoView(): void {
  if (!state.selectedNodeId) return
  tabListEl
    .querySelector<HTMLElement>(`[data-node-id="${state.selectedNodeId}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}

function moveSelection(delta: number): void {
  const nodes = liveRows.map((r) => r.node)
  if (!nodes.length) return
  let idx = nodes.findIndex((n) => n.id === state.selectedNodeId)
  if (idx === -1) idx = delta > 0 ? -1 : 0
  const next = Math.max(0, Math.min(nodes.length - 1, idx + delta))
  selectNode(nodes[next].id)
  scrollSelectedIntoView()
}

// Cmd+1..9 (and clicking a number) jump to the Nth row: focus a terminal,
// or select + reveal a folder.
export function activateRowByNumber(n: number): void {
  const node = liveRows[n - 1]?.node
  if (!node) return
  if (node.kind === 'tab') {
    selectTab(node.id)
  } else {
    selectNode(node.id)
    if (node.collapsed) toggleCollapse(node.id)
    focusList()
    scrollSelectedIntoView()
  }
}

tabListEl.tabIndex = 0
tabListEl.addEventListener('keydown', (e) => {
  if (sidebarMode === 'database') return // database view has no key-nav (v1)
  if (sidebarMode === 'notebook') {
    handleNotebookKey(e)
    return
  }
  const node = selectedNode()
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      moveSelection(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      moveSelection(-1)
      break
    case 'ArrowRight':
      e.preventDefault()
      if (node?.kind === 'folder' && node.collapsed) toggleCollapse(node.id)
      else moveSelection(1)
      break
    case 'ArrowLeft': {
      e.preventDefault()
      if (node?.kind === 'folder' && !node.collapsed) {
        toggleCollapse(node.id)
        break
      }
      const trail = node ? ancestorFolders(state.tree, node.id) : null
      const parent = trail && trail.length ? trail[trail.length - 1] : null
      if (parent) {
        selectNode(parent.id)
        scrollSelectedIntoView()
      }
      break
    }
    case 'Enter':
      e.preventDefault()
      if (node?.kind === 'tab') selectTab(node.id)
      else if (node?.kind === 'folder') toggleCollapse(node.id)
      break
  }
})

const STATUS_LABEL: Record<PaneStatus, string> = {
  running: 'running',
  idle: 'idle',
  attention: 'needs input'
}


// Crisp disclosure chevron — CSS rotates it 90° when the folder is expanded.
const CHEVRON_SVG =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>'

// Folder glyph shown on group rows (file-explorer look).
const FOLDER_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1.6 4.4c0-.6.4-1 1-1h3.1l1.2 1.4H13.4c.6 0 1 .4 1 1V11.6c0 .6-.4 1-1 1H2.6c-.6 0-1-.4-1-1z" fill="currentColor"/></svg>'
// project icon: a stack/box, distinct from the folder
const PROJECT_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M8 1.5l5.5 3.1v6.8L8 14.5 2.5 11.4V4.6z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M2.6 4.7L8 7.8l5.4-3.1M8 7.8v6.5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>'
// plan-file glyph (document) shown on plan sub-rows under a terminal node
const PLAN_SVG =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M4 1.5h5l3 3v10H4z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M9 1.5v3h3M6 8h4M6 10.5h4" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>'
// feature/worktree folder icon: a git-branch glyph (marks a worktree feature)
const WORKTREE_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="4.5" cy="3.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="4.5" cy="12.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="11.5" cy="3.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 5.1v5.8M11.5 5.1v1.2c0 2.2-1.8 3.4-3.9 3.9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'

let isEditing = false
let draggedId: string | null = null
let dndMode: DropMode = 'after'

interface LiveRow {
  node: SidebarNode
  dot: HTMLElement
  sub: HTMLElement | null
  numEl: HTMLElement
}
let liveRows: LiveRow[] = []

function orderNumEl(): HTMLElement {
  const el = document.createElement('span')
  el.className = 'order-num'
  return el
}

// Number every visible row top-to-bottom; the first 9 map to Cmd+1..9.
function applyOrder(): void {
  liveRows.forEach((r, i) => {
    r.numEl.textContent = String(i + 1)
    r.numEl.classList.toggle('shortcut', i < 9)
  })
}

// ---------------------------------------------------------------------------
// Status / detail helpers
// ---------------------------------------------------------------------------

function statusOfNode(node: SidebarNode): PaneStatus {
  const tabs: TabNode[] = node.kind === 'tab' ? [node] : allTabs([node])
  let running = false
  for (const t of tabs) {
    for (const id of panesInLayout(t.root)) {
      const p = panes.get(id)
      if (!p) continue
      const s = paneStatus(p)
      if (s === 'attention') return 'attention'
      if (s === 'running') running = true
    }
  }
  return running ? 'running' : 'idle'
}

function tabDetail(node: TabNode): string {
  const parts: string[] = []
  if (settings.sidebar.details.status) parts.push(STATUS_LABEL[statusOfNode(node)])
  if (settings.sidebar.details.git) {
    const branch = panes.get(firstPaneOf(node.root) ?? '')?.branch
    if (branch) parts.push(branch)
  }
  if (settings.sidebar.details.panes) {
    const n = panesInLayout(node.root).length
    parts.push(n === 1 ? '1 pane' : `${n} panes`)
  }
  return parts.join(' · ')
}

function hexToRgba(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return 'transparent'
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`
}

function applyRowColor(row: HTMLElement, color: string | null): void {
  if (!color) return
  row.classList.add('has-color')
  row.style.setProperty('--row-color', color)
  row.style.setProperty('--row-tint', hexToRgba(color, 0.085))
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

type SidebarMode = 'terminal' | 'notebook' | 'database'
let sidebarMode: SidebarMode = 'terminal'

const tabTerminalEl = document.getElementById('tab-terminal')!
const tabNotebookEl = document.getElementById('tab-notebook')!
const tabDatabaseEl = document.getElementById('tab-database')!
tabTerminalEl.addEventListener('click', () => setSidebarMode('terminal'))
tabNotebookEl.addEventListener('click', () => setSidebarMode('notebook'))
tabDatabaseEl.addEventListener('click', () => setSidebarMode('database'))

export function setSidebarMode(m: SidebarMode): void {
  sidebarMode = m
  appEl.classList.toggle('mode-notebook', m === 'notebook')
  appEl.classList.toggle('mode-database', m === 'database')
  tabTerminalEl.classList.toggle('active', m === 'terminal')
  tabNotebookEl.classList.toggle('active', m === 'notebook')
  tabDatabaseEl.classList.toggle('active', m === 'database')
  // shared search bar: reset + relabel for the active view
  searchInputEl.value = ''
  searchQuery = ''
  nbClearQuery()
  searchInputEl.placeholder =
    m === 'notebook' ? 'Search notes…' : m === 'database' ? 'Search…' : 'Search…'
  if (m === 'notebook') void renderNotebook(tabListEl)
  else if (m === 'database') void renderDatabase(tabListEl)
  else renderSidebar()
  tabListEl.focus() // enable arrow-key navigation in the chosen view
}

export function isNotebookMode(): boolean {
  return sidebarMode === 'notebook'
}

export function isDatabaseMode(): boolean {
  return sidebarMode === 'database'
}

export function renderSidebar(): void {
  if (isEditing) return
  if (sidebarMode === 'notebook' || sidebarMode === 'database') return // those views own the list
  liveRows = []
  tabListEl.replaceChildren()

  const q = searchQuery.trim().toLowerCase()
  if (q) {
    renderFiltered(state.tree, 0, [], q)
    if (!tabListEl.childElementCount) {
      const hint = document.createElement('div')
      hint.className = 'empty-hint'
      hint.textContent = 'No matches'
      tabListEl.appendChild(hint)
    }
    applyOrder()
    return
  }

  const pinned = collectPinnedRoots(state.tree)
  if (pinned.length) {
    tabListEl.appendChild(sectionLabel('Pinned'))
    pinned.forEach((node, i) => {
      renderNode(node, 0, 'all', [], i === pinned.length - 1, folderCrumb(node.id))
    })
    tabListEl.appendChild(sectionSep())
  }
  renderTopLevel()
  applyOrder()
}

// Top level is bucketed by the `group` (workspace) label carried on containers
// (projects + company folders): a header per group, then any ungrouped nodes
// under an "Ungrouped" header. With no group labels at all, fall back to the
// flat list (keeps the pre-groups look for users who don't use groups).
function renderTopLevel(): void {
  const top = state.tree.filter((n) => !n.pinned) // pinned shown in their own section
  const groupOf = (n: SidebarNode): string => (isContainer(n) ? n.group || '' : '')
  if (!top.some((n) => groupOf(n))) {
    renderList(state.tree, 0, 'normal', [])
    return
  }
  const groups = new Map<string, SidebarNode[]>()
  const order: string[] = []
  for (const n of top) {
    const g = groupOf(n)
    if (!groups.has(g)) {
      groups.set(g, [])
      order.push(g)
    }
    groups.get(g)!.push(n)
  }
  for (const g of order.filter((x) => x)) {
    tabListEl.appendChild(groupHeader(g))
    const arr = groups.get(g)!
    arr.forEach((node, i) => renderNode(node, 0, 'normal', [], i === arr.length - 1))
  }
  const ungrouped = groups.get('') ?? []
  if (ungrouped.length) {
    tabListEl.appendChild(groupHeader('Ungrouped', true))
    ungrouped.forEach((node, i) => renderNode(node, 0, 'normal', [], i === ungrouped.length - 1))
  }
}

// A group/workspace label that accepts a dropped container (project or company
// folder) to set its group; the "Ungrouped" header clears it.
function groupHeader(name: string, isUngrouped = false): HTMLElement {
  const el = sectionLabel(name)
  el.classList.add('group-header')
  el.addEventListener('dragover', (e) => {
    if (!draggedId) return
    const r = findById(state.tree, draggedId)
    if (!r || !isContainer(r.node)) return
    e.preventDefault()
    el.classList.add('drag-over')
  })
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'))
  el.addEventListener('drop', (e) => {
    e.preventDefault()
    el.classList.remove('drag-over')
    if (draggedId) setNodeGroup(draggedId, isUngrouped ? '' : name)
  })
  return el
}

// Context-menu action: type a group/workspace label for a container. Typing a
// new name creates that group header; to clear, drag the node onto "Ungrouped".
async function promptGroup(node: FolderNode | ProjectNode): Promise<void> {
  const g = await promptText({
    title: 'Set group',
    label: 'Group / workspace',
    value: node.group ?? '',
    placeholder: 'work',
    confirmText: 'Set'
  })
  if (g !== null) setNodeGroup(node.id, g)
}

interface Crumb {
  text: string
  color: string | null
}

// Group path of a node ("Movve / Mobil") — shown in the Pinned section so a
// pinned terminal still tells you which group it belongs to.
function folderCrumb(id: string): Crumb | null {
  const trail = ancestorFolders(state.tree, id)
  if (!trail || trail.length === 0) return null
  return {
    text: trail.map((f) => f.name).join(' / '),
    color: [...trail].reverse().find((f) => f.color)?.color ?? null
  }
}

function buildCrumb(crumb: Crumb): HTMLElement {
  const el = document.createElement('div')
  el.className = 'tab-crumb'
  const dot = document.createElement('span')
  dot.className = 'crumb-dot'
  if (crumb.color) dot.style.background = crumb.color
  const text = document.createElement('span')
  text.className = 'crumb-text'
  text.textContent = crumb.text
  el.append(dot, text)
  return el
}

function sectionLabel(text: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'section-label'
  el.textContent = text
  return el
}
function sectionSep(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'section-sep'
  return el
}

// `guides[level]` is true when an ancestor at that indent level still has
// siblings below it — i.e. a vertical guide line must continue down past
// this row at that column.
function renderList(
  list: SidebarNode[],
  depth: number,
  mode: 'normal' | 'all',
  guides: boolean[]
): void {
  const visible = mode === 'normal' ? list.filter((n) => !n.pinned) : list
  visible.forEach((node, i) => {
    renderNode(node, depth, mode, guides, i === visible.length - 1)
  })
}

function renderNode(
  node: SidebarNode,
  depth: number,
  mode: 'normal' | 'all',
  guides: boolean[],
  isLast: boolean,
  crumb: Crumb | null = null
): void {
  if (node.kind === 'folder' || node.kind === 'project') {
    tabListEl.appendChild(buildFolderRow(node, depth, guides, isLast, crumb))
    if (!node.collapsed) renderList(node.children, depth + 1, mode, [...guides, !isLast])
  } else {
    tabListEl.appendChild(buildTabRow(node, depth, guides, isLast, crumb))
  }
}

// ---- Search filter (case-insensitive "contains" on titles + folder names) ----

function nodeLabel(node: SidebarNode): string {
  return node.kind === 'tab' ? node.title : node.name
}

function subtreeMatches(node: SidebarNode, q: string): boolean {
  if (nodeLabel(node).toLowerCase().includes(q)) return true
  return (
    (node.kind === 'folder' || node.kind === 'project') &&
    node.children.some((c) => subtreeMatches(c, q))
  )
}

// Filtered tree: keep matching nodes plus their ancestor folders, force-expanded.
function renderFiltered(list: SidebarNode[], depth: number, guides: boolean[], q: string): void {
  const visible = list.filter((n) => subtreeMatches(n, q))
  visible.forEach((node, i) => {
    const isLast = i === visible.length - 1
    if (node.kind === 'folder' || node.kind === 'project') {
      tabListEl.appendChild(buildFolderRow(node, depth, guides, isLast, null))
      renderFiltered(node.children, depth + 1, [...guides, !isLast], q)
    } else {
      tabListEl.appendChild(buildTabRow(node, depth, guides, isLast, null))
    }
  })
}

const INDENT = 14

// Tree guide lines for the indentation area: continuing vertical lines for
// ancestors plus an elbow (└ for the last child, ├ otherwise) into this row.
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

function buildTabRow(
  node: TabNode,
  depth: number,
  guides: boolean[],
  isLast: boolean,
  crumb: Crumb | null
): HTMLElement {
  const row = document.createElement('div')
  row.className =
    'tab-item' +
    (node.id === state.activeTabId ? ' active' : '') +
    (node.id === state.selectedNodeId ? ' selected' : '')
  row.dataset.nodeId = node.id
  row.dataset.tabId = node.id
  row.draggable = true
  row.style.paddingLeft = 10 + depth * INDENT + 'px'
  applyRowColor(row, node.color)
  const treeGuides = buildGuides(depth, guides, isLast)
  if (treeGuides) row.appendChild(treeGuides)
  if (crumb) row.appendChild(buildCrumb(crumb))

  const top = document.createElement('div')
  top.className = 'tab-row'
  const detail = tabDetail(node)
  const paneIds = panesInLayout(node.root)
  // Optional: list each pane (running app) as a sub-row under the terminal.
  const showPanes = settings.sidebar.details.paneList && paneIds.length > 1
  const expandable = !!detail || showPanes
  // Chevron toggles the expanded section; collapsed rows are as thin as a folder
  // row. Only shown when there's something to reveal (detail line and/or panes).
  if (expandable) {
    const tri = document.createElement('span')
    tri.className = 'tri' + (node.detailsOpen ? ' expanded' : '')
    tri.innerHTML = CHEVRON_SVG
    tri.title = node.detailsOpen ? 'Hide details' : 'Show details'
    tri.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleTabDetails(node.id)
    })
    top.append(tri)
  }
  const dot = document.createElement('span')
  dot.className = 'status-dot ' + statusOfNode(node)
  const title = document.createElement('span')
  title.className = 'tab-title'
  title.textContent = node.title
  const numEl = orderNumEl()
  top.append(dot, title, numEl)
  if (node.pinned) top.append(pinBadge())
  row.append(top)

  let sub: HTMLElement | null = null
  if (expandable && node.detailsOpen) {
    if (detail) {
      sub = document.createElement('div')
      sub.className = 'tab-sub'
      sub.textContent = detail
      row.append(sub)
    }
    if (showPanes) {
      const paneList = document.createElement('div')
      paneList.className = 'tab-panes'
      for (const id of paneIds) {
        const p = panes.get(id)
        const prow = document.createElement('div')
        prow.className = 'tab-pane-row'
        const pdot = document.createElement('span')
        pdot.className = 'status-dot ' + (p ? paneStatus(p) : 'idle')
        const ptitle = document.createElement('span')
        ptitle.className = 'tab-pane-title'
        ptitle.textContent = p?.title || 'terminal'
        prow.append(pdot, ptitle)
        prow.addEventListener('click', (e) => {
          e.stopPropagation()
          selectPane(id)
        })
        paneList.appendChild(prow)
      }
      row.append(paneList)
    }
  }

  // Plan files for this terminal's branch (docs/plans/<branch>-*.md) — always
  // shown as sub-rows when present; click opens the plan in the markdown viewer.
  const firstPane = panes.get(firstPaneOf(node.root) ?? '')
  const plans = firstPane?.plans ?? []
  if (plans.length) {
    const planList = document.createElement('div')
    planList.className = 'tab-plans'
    for (const plan of plans) {
      const prow = document.createElement('div')
      prow.className = 'tab-plan-row'
      prow.title = plan.path
      const pic = document.createElement('span')
      pic.className = 'tab-plan-icon'
      pic.innerHTML = PLAN_SVG
      const ptitle = document.createElement('span')
      ptitle.className = 'tab-plan-title'
      ptitle.textContent = plan.name.replace(/\.(md|mdx|mdc)$/i, '')
      prow.append(pic, ptitle)
      prow.addEventListener('click', (e) => {
        e.stopPropagation()
        openMarkdownFile(plan.path)
      })
      planList.appendChild(prow)
    }
    row.append(planList)
  }

  row.addEventListener('click', () => selectTab(node.id))
  row.addEventListener('dblclick', (e) => {
    e.preventDefault()
    startRename(node)
  })
  row.addEventListener('contextmenu', (e) => showMenu(e, node))
  wireDnd(row, node)

  liveRows.push({ node, dot, sub, numEl })
  return row
}

function buildFolderRow(
  node: FolderNode | ProjectNode,
  depth: number,
  guides: boolean[],
  isLast: boolean,
  crumb: Crumb | null
): HTMLElement {
  const row = document.createElement('div')
  row.className = 'tab-item folder' + (node.id === state.selectedNodeId ? ' selected' : '')
  row.dataset.nodeId = node.id
  row.draggable = true
  row.style.paddingLeft = 10 + depth * INDENT + 'px'
  applyRowColor(row, node.color)
  const treeGuides = buildGuides(depth, guides, isLast)
  if (treeGuides) row.appendChild(treeGuides)
  if (crumb) row.appendChild(buildCrumb(crumb))

  const top = document.createElement('div')
  top.className = 'tab-row'
  const tri = document.createElement('span')
  tri.className = 'tri' + (node.collapsed ? '' : ' expanded')
  tri.innerHTML = CHEVRON_SVG
  tri.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleCollapse(node.id)
  })
  const icon = document.createElement('span')
  const isFeature = node.kind === 'folder' && !!node.feature
  icon.className =
    'folder-icon' +
    (node.kind === 'project' ? ' project-icon' : '') +
    (isFeature ? ' worktree-icon' : '')
  icon.innerHTML = isFeature ? WORKTREE_SVG : node.kind === 'project' ? PROJECT_SVG : FOLDER_SVG
  if (isFeature) icon.title = `worktree: ${node.feature}`
  const name = document.createElement('span')
  name.className = 'tab-title'
  name.textContent = node.name
  const badge = document.createElement('span')
  badge.className = 'tab-badge'
  badge.textContent = String(allTabs([node]).length)
  const numEl = orderNumEl()
  top.append(tri, icon, name, numEl, badge)
  if (node.pinned) top.append(pinBadge())
  row.append(top)

  row.addEventListener('click', () => {
    selectNode(node.id)
    focusList()
    toggleCollapse(node.id)
  })
  row.addEventListener('contextmenu', (e) => showMenu(e, node))
  wireDnd(row, node)

  liveRows.push({ node, dot: icon, sub: null, numEl })
  return row
}

function pinBadge(): HTMLElement {
  const el = document.createElement('span')
  el.className = 'pin-badge'
  el.textContent = '●'
  el.title = 'pinned'
  return el
}

// ---------------------------------------------------------------------------
// Light updates (no DOM rebuild — keeps interactions alive)
// ---------------------------------------------------------------------------

export function updateStatuses(): void {
  if (isEditing) return
  for (const { node, dot, sub } of liveRows) {
    if (node.kind === 'tab') dot.className = 'status-dot ' + statusOfNode(node)
    if (sub && node.kind === 'tab') sub.textContent = tabDetail(node)
  }
}

export function updateActiveTab(): void {
  tabListEl.querySelectorAll<HTMLElement>('.tab-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.tabId === state.activeTabId)
    el.classList.toggle(
      'selected',
      !!state.selectedNodeId && el.dataset.nodeId === state.selectedNodeId
    )
  })
}

// ---------------------------------------------------------------------------
// Inline rename
// ---------------------------------------------------------------------------

function startRename(node: SidebarNode): void {
  const titleEl = tabListEl.querySelector<HTMLElement>(`[data-node-id="${node.id}"] .tab-title`)
  if (!titleEl) return
  const parent = titleEl.parentElement!
  isEditing = true
  const input = document.createElement('input')
  input.className = 'rename-input'
  input.value = node.kind === 'tab' ? node.title : node.name
  parent.replaceChild(input, titleEl)
  input.focus()
  input.select()
  const finish = (commit: boolean): void => {
    isEditing = false
    if (commit && input.value.trim()) setNodeName(node.id, input.value)
    else renderSidebar()
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') finish(true)
    else if (e.key === 'Escape') finish(false)
  })
  input.addEventListener('blur', () => finish(true))
}

// Inline-rename the currently selected sidebar node (terminal/folder). Used by
// the Cmd+Shift+R shortcut; no-op if nothing is selected or its row is hidden.
export function renameSelected(): void {
  const node = selectedNode()
  if (node) startRename(node)
}

// Per-folder settings modal (startup command / env / shell).
function showFolderSettings(node: FolderNode | ProjectNode): void {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal prompt-modal'
  overlay.appendChild(modal)

  const h = document.createElement('h2')
  h.textContent = 'Folder settings — ' + node.name
  modal.appendChild(h)

  const textField = (label: string, value: string, ph: string): HTMLInputElement => {
    const f = document.createElement('div')
    f.className = 'field'
    const l = document.createElement('label')
    l.textContent = label
    const i = document.createElement('input')
    i.type = 'text'
    i.value = value
    i.placeholder = ph
    f.append(l, i)
    modal.appendChild(f)
    return i
  }
  const startup = textField('Startup command', node.startup ?? '', 'e.g. claude')
  const shell = textField('Shell', node.shell ?? '', '(default)')

  const envWrap = document.createElement('div')
  envWrap.className = 'field field-col'
  const envLabel = document.createElement('label')
  envLabel.textContent = 'Environment (KEY=VALUE per line)'
  const env = document.createElement('textarea')
  env.className = 'folder-env'
  env.value = node.env ?? ''
  env.rows = 4
  env.placeholder = 'FOO=bar\nNODE_ENV=development'
  envWrap.append(envLabel, env)
  modal.appendChild(envWrap)

  const actions = document.createElement('div')
  actions.className = 'modal-actions'
  const cancel = document.createElement('button')
  cancel.textContent = 'Cancel'
  const save = document.createElement('button')
  save.className = 'primary'
  save.textContent = 'Save'
  actions.append(cancel, save)
  modal.appendChild(actions)

  const close = (): void => overlay.remove()
  cancel.addEventListener('click', close)
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  save.addEventListener('click', () => {
    node.startup = startup.value.trim() || undefined
    node.shell = shell.value.trim() || undefined
    node.env = env.value.trim() || undefined
    saveSoon()
    renderSidebar()
    close()
  })
  modal.querySelectorAll('input, textarea').forEach((el) =>
    el.addEventListener('keydown', (e) => e.stopPropagation())
  )

  document.body.appendChild(overlay)
  startup.focus()
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

function showMenu(e: MouseEvent, node: SidebarNode): void {
  const items: ContextMenuItem[] = []
  if (node.kind === 'tab') {
    const trail = ancestorFolders(state.tree, node.id)
    const parentId = trail && trail.length ? trail[trail.length - 1].id : null
    items.push({ label: 'New Claude terminal', run: () => void newClaudeTab(parentId) })
    items.push({ label: 'Rename', run: () => startRename(node) })
    if (node.titleLocked) items.push({ label: 'Auto-name', run: () => autoNameTab(node.id) })
    items.push({ label: node.pinned ? 'Unpin' : 'Pin', run: () => togglePin(node.id) })
    items.push({ label: 'Close tab', run: () => closeTab(node.id), danger: true })
  } else {
    items.push({ label: 'New terminal here', run: () => void newTab(node.id) })
    items.push({ label: 'New Claude terminal here', run: () => void newClaudeTab(node.id) })
    items.push({ label: 'New subfolder', run: () => void newFolder(node.id) })
    if (node.kind === 'project') {
      const projPath = node.path
      const projName = node.name
      const tmpl = (): { name: string; path: string } =>
        findProjectByPath(settings.projects, projPath) ?? { name: projName, path: projPath }
      items.push({ label: 'Run applications…', run: () => showRunApps(tmpl()) })
      items.push({ label: 'New feature…', run: () => showFeatureSetup(tmpl()) })
    }
    items.push({ label: 'Rename', run: () => startRename(node) })
    items.push({ label: 'Set group…', run: () => void promptGroup(node) })
    items.push({ label: 'Folder settings…', run: () => showFolderSettings(node) })
    items.push({ label: node.pinned ? 'Unpin' : 'Pin', run: () => togglePin(node.id) })
    items.push({ label: 'Delete folder', run: () => deleteFolder(node.id), danger: true })
  }
  showContextMenu(e, items, {
    current: node.color,
    onPick: (c) => setNodeColor(node.id, c)
  })
}

// ---------------------------------------------------------------------------
// Drag & drop
// ---------------------------------------------------------------------------

function clearDndIndicators(): void {
  tabListEl
    .querySelectorAll('.drag-before, .drag-after, .drag-into')
    .forEach((el) => el.classList.remove('drag-before', 'drag-after', 'drag-into'))
}

function wireDnd(row: HTMLElement, node: SidebarNode): void {
  row.addEventListener('dragstart', (e) => {
    draggedId = node.id
    e.dataTransfer?.setData('text/plain', node.id)
    e.stopPropagation()
  })
  row.addEventListener('dragend', () => {
    draggedId = null
    clearDndIndicators()
  })
  row.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!draggedId || draggedId === node.id) return
    const rect = row.getBoundingClientRect()
    const y = e.clientY - rect.top
    if (node.kind === 'folder') {
      if (y < rect.height * 0.25) dndMode = 'before'
      else if (y > rect.height * 0.75) dndMode = 'after'
      else dndMode = 'into'
    } else {
      dndMode = y < rect.height * 0.5 ? 'before' : 'after'
    }
    clearDndIndicators()
    row.classList.add('drag-' + dndMode)
  })
  row.addEventListener('dragleave', () => {
    row.classList.remove('drag-before', 'drag-after', 'drag-into')
  })
  row.addEventListener('drop', (e) => {
    e.preventDefault()
    e.stopPropagation()
    clearDndIndicators()
    if (draggedId) moveNode(draggedId, node.id, dndMode)
    draggedId = null
  })
}

// Drop on empty sidebar space -> move to root
tabListEl.addEventListener('dragover', (e) => e.preventDefault())
tabListEl.addEventListener('drop', (e) => {
  e.preventDefault()
  if (draggedId) moveNode(draggedId, null, 'into')
  draggedId = null
  clearDndIndicators()
})

// ---------------------------------------------------------------------------
// Orientation + resize
// ---------------------------------------------------------------------------

export function applyOrientation(): void {
  appEl.classList.toggle('orient-top', settings.sidebar.orientation === 'top')
  appEl.classList.toggle('orient-left', settings.sidebar.orientation === 'left')
  applySidebarSize()
}

// Sidebar text scales from a single base font-size set on #sidebar (row text
// uses em). Cmd+/- adjusts it when the sidebar (not a terminal) has focus.
export function applySidebarFont(): void {
  sidebarEl.style.fontSize = (settings.sidebar.fontSize ?? 13) + 'px'
}

export function adjustSidebarFontSize(delta: number): void {
  const cur = settings.sidebar.fontSize ?? 13
  settings.sidebar.fontSize = Math.max(9, Math.min(22, cur + delta))
  applySidebarFont()
  saveSoon()
}

export function resetSidebarFontSize(): void {
  settings.sidebar.fontSize = 13
  applySidebarFont()
  saveSoon()
}

export function sidebarHasFocus(): boolean {
  return sidebarEl.contains(document.activeElement)
}

export function applySidebarSize(): void {
  if (settings.sidebar.orientation === 'left') {
    sidebarEl.style.width = settings.sidebar.size + 'px'
    sidebarEl.style.height = ''
  } else {
    sidebarEl.style.height = settings.sidebar.size + 'px'
    sidebarEl.style.width = ''
  }
}

export function wireSidebarResizer(onDone: () => void): void {
  const rz = document.getElementById('sidebar-resizer')!
  rz.addEventListener('mousedown', (e) => {
    e.preventDefault()
    const horizontal = settings.sidebar.orientation === 'left'
    const rect = sidebarEl.getBoundingClientRect()
    const onMove = (ev: MouseEvent): void => {
      const size = horizontal ? ev.clientX - rect.left : ev.clientY - rect.top
      settings.sidebar.size = Math.max(120, Math.min(600, size))
      applySidebarSize()
    }
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      onDone()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize'
  })
}
