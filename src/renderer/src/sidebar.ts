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
  setNodeGroup
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
  showRunCommand,
  runUpdate
} from './pickers'
import { showImproveModal } from './improve'
import { promptText } from './dialog'
import { renderDatabase, databaseHandleKey, dbApplyQuery } from './database'
import { type ContextMenuItem } from './contextmenu'
import { createTreeView, type TreeAdapter, type TreeSection, type DropPos } from './treeview'
import {
  renderNotebook,
  handleNotebookKey,
  nbApplyQuery,
  nbClearQuery,
  notebookSelectFirst
} from './notebook'
import './sidebar.css'

const appEl = document.getElementById('app')!
const sidebarEl = document.getElementById('sidebar')!
const tabListEl = document.getElementById('tab-list')!
const searchInputEl = document.getElementById('search-input') as HTMLInputElement

let searchQuery = ''
searchInputEl.addEventListener('input', () => {
  if (sidebarMode === 'notebook') nbApplyQuery(searchInputEl.value)
  else if (sidebarMode === 'database') dbApplyQuery(searchInputEl.value)
  else {
    searchQuery = searchInputEl.value
    tree.setFilter(searchQuery)
  }
})
searchInputEl.addEventListener('keydown', (e) => {
  e.stopPropagation()
  if (e.key === 'Escape') {
    searchInputEl.value = ''
    if (sidebarMode === 'notebook') nbApplyQuery('')
    else if (sidebarMode === 'database') dbApplyQuery('')
    else {
      searchQuery = ''
      tree.setFilter('')
    }
    searchInputEl.blur()
  } else if (e.key === 'ArrowDown') {
    // step from the search box into the result list
    e.preventDefault()
    focusList()
    if (sidebarMode === 'notebook') notebookSelectFirst()
    else tree.selectFirst()
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
// Keyboard navigation (delegated to the active view's tree)
// ---------------------------------------------------------------------------

function focusList(): void {
  tabListEl.focus()
}

function scrollSelectedIntoView(): void {
  if (!state.selectedNodeId) return
  tabListEl
    .querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(state.selectedNodeId)}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}

// Cmd+1..9 (and clicking a number) jump to the Nth visible row: focus a terminal,
// or select + reveal a folder.
export function activateRowByNumber(n: number): void {
  const node = tree.visibleNodes()[n - 1]
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
  if (sidebarMode === 'database') {
    databaseHandleKey(e)
    return
  }
  if (sidebarMode === 'notebook') {
    handleNotebookKey(e)
    return
  }
  tree.handleKey(e)
})

const STATUS_LABEL: Record<PaneStatus, string> = {
  running: 'running',
  idle: 'idle',
  attention: 'needs input'
}

// Crisp disclosure chevron — CSS rotates it 90° when expanded.
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

// ---------------------------------------------------------------------------
// Sidebar mode (terminal / notebook / database)
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
  dbApplyQuery('')
  searchInputEl.placeholder =
    m === 'notebook' ? 'Search notes…' : m === 'database' ? 'Search databases…' : 'Search…'
  if (m === 'notebook') void renderNotebook(tabListEl)
  else if (m === 'database') void renderDatabase(tabListEl)
  else {
    tree.setFilter('')
    renderSidebar()
  }
  tabListEl.focus() // enable arrow-key navigation in the chosen view
}

export function isNotebookMode(): boolean {
  return sidebarMode === 'notebook'
}

export function isDatabaseMode(): boolean {
  return sidebarMode === 'database'
}

// ---------------------------------------------------------------------------
// Section headers + breadcrumbs
// ---------------------------------------------------------------------------

function sectionLabel(text: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'section-label'
  el.textContent = text
  return el
}

// A group/workspace label that accepts a dropped container (project or company
// folder) to set its group; the "Ungrouped" header clears it.
function groupHeader(name: string, isUngrouped = false): HTMLElement {
  const el = sectionLabel(name)
  el.classList.add('group-header')
  el.addEventListener('dragover', (e) => {
    e.preventDefault()
    el.classList.add('drag-over')
  })
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'))
  el.addEventListener('drop', (e) => {
    e.preventDefault()
    el.classList.remove('drag-over')
    const dragId = e.dataTransfer?.getData('text/plain')
    if (!dragId) return
    const r = findById(state.tree, dragId)
    if (!r || !isContainer(r.node)) return // only containers carry a group
    setNodeGroup(dragId, isUngrouped ? '' : name)
  })
  return el
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

// Context-menu action: type a group/workspace label for a container.
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

// ---------------------------------------------------------------------------
// Slot builders (terminal-specific row content injected into the tree rows)
// ---------------------------------------------------------------------------

function pinBadge(): HTMLElement {
  const el = document.createElement('span')
  el.className = 'pin-badge'
  el.textContent = '●'
  el.title = 'pinned'
  return el
}

// Is there anything to reveal under a terminal row (detail line, panes, plans)?
function tabExpandable(node: TabNode): boolean {
  if (tabDetail(node)) return true
  if (settings.sidebar.details.paneList && panesInLayout(node.root).length > 1) return true
  const firstPane = panes.get(firstPaneOf(node.root) ?? '')
  const plans = (firstPane?.plans ?? []).filter(
    (p) => p.ownerStableId != null && p.ownerStableId === firstPane?.stableId
  )
  return plans.length > 0
}

// leading slot: a terminal's detail chevron (if expandable) + status dot.
function buildLeading(node: SidebarNode): HTMLElement | null {
  if (node.kind !== 'tab') return null
  const wrap = document.createElement('span')
  wrap.className = 'tab-leading'
  if (tabExpandable(node)) {
    const tri = document.createElement('span')
    tri.className = 'tri' + (node.detailsOpen ? ' expanded' : '')
    tri.innerHTML = CHEVRON_SVG
    tri.title = node.detailsOpen ? 'Hide details' : 'Show details'
    tri.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleTabDetails(node.id)
    })
    wrap.appendChild(tri)
  }
  const dot = document.createElement('span')
  dot.className = 'status-dot ' + statusOfNode(node)
  wrap.appendChild(dot)
  return wrap
}

// below slot: detail line + per-pane sub-rows (when expanded) + plan sub-rows.
function buildBelow(node: SidebarNode): HTMLElement | null {
  if (node.kind !== 'tab') return null
  const frag = document.createElement('div')
  frag.className = 'tab-below'
  const detail = tabDetail(node)
  const paneIds = panesInLayout(node.root)
  const showPanes = settings.sidebar.details.paneList && paneIds.length > 1

  if (node.detailsOpen) {
    if (detail) {
      const sub = document.createElement('div')
      sub.className = 'tab-sub'
      sub.textContent = detail
      frag.appendChild(sub)
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
      frag.appendChild(paneList)
    }
  }

  // Plan files for this terminal's branch. Only shown when the user has
  // expanded the tab's detail line, so plans don't sit between rows and get
  // mis-clicked as a terminal. Filtered to the pane whose stableId is encoded
  // in the filename's --pane-<uuid> suffix; legacy plans (no suffix) are ignored.
  if (node.detailsOpen) {
    const firstPane = panes.get(firstPaneOf(node.root) ?? '')
    const plans = (firstPane?.plans ?? []).filter(
      (p) => p.ownerStableId != null && p.ownerStableId === firstPane?.stableId
    )
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
        prow.addEventListener('mousedown', (e) => e.stopPropagation())
        prow.addEventListener('click', (e) => {
          e.stopPropagation()
          openMarkdownFile(plan.path)
        })
        planList.appendChild(prow)
      }
      frag.appendChild(planList)
    }
  }

  return frag.childElementCount ? frag : null
}

// trailing slot: folder child-count badge + pin badge.
function buildTrailing(node: SidebarNode): HTMLElement | null {
  const wrap = document.createElement('span')
  if (node.kind === 'folder' || node.kind === 'project') {
    const badge = document.createElement('span')
    badge.className = 'tab-badge'
    badge.textContent = String(allTabs([node]).length)
    wrap.appendChild(badge)
  }
  if (node.pinned) wrap.appendChild(pinBadge())
  return wrap.childElementCount ? wrap : null
}

// ---------------------------------------------------------------------------
// Context menu (per-node items; color swatch is added by the tree)
// ---------------------------------------------------------------------------

function buildMenu(node: SidebarNode): ContextMenuItem[] {
  const items: ContextMenuItem[] = []
  if (node.kind === 'tab') {
    const trail = ancestorFolders(state.tree, node.id)
    const parentId = trail && trail.length ? trail[trail.length - 1].id : null
    items.push({ label: 'New Claude terminal', run: () => void newClaudeTab(parentId) })
    items.push({ label: 'Rename', run: () => tree.beginRename(node.id) })
    if (node.titleLocked) items.push({ label: 'Auto-name', run: () => autoNameTab(node.id) })
    items.push({ label: node.pinned ? 'Unpin' : 'Pin', run: () => togglePin(node.id) })
    items.push({ label: 'Close tab', run: () => closeTab(node.id), danger: true })
  } else {
    // A project node opens its terminals at the project's path; folders inherit
    // the active terminal's cwd (the legacy behaviour).
    const cwd = node.kind === 'project' ? node.path : undefined
    items.push({ label: 'New terminal here', run: () => void newTab(node.id, cwd) })
    items.push({ label: 'New Claude terminal here', run: () => void newClaudeTab(node.id, cwd) })
    items.push({ label: 'New subfolder', run: () => void newFolder(node.id) })
    if (node.kind === 'project') {
      items.push({ label: 'Run applications…', run: () => showRunApps(node) })
      if (node.runCommands && node.runCommands.length) {
        items.push({ label: 'Run command…', run: () => showRunCommand(node) })
      }
      items.push({ label: 'New feature…', run: () => showFeatureSetup(node) })
    }
    items.push({ label: 'Rename', run: () => tree.beginRename(node.id) })
    items.push({ label: 'Set group…', run: () => void promptGroup(node) })
    items.push({ label: 'Folder settings…', run: () => showFolderSettings(node) })
    items.push({ label: node.pinned ? 'Unpin' : 'Pin', run: () => togglePin(node.id) })
    items.push({ label: 'Delete folder', run: () => deleteFolder(node.id), danger: true })
  }
  return items
}

// ---------------------------------------------------------------------------
// The terminal TreeView
// ---------------------------------------------------------------------------

const adapter: TreeAdapter<SidebarNode> = {
  id: (n) => n.id,
  label: (n) => (n.kind === 'tab' ? n.title : n.name),
  icon: (n) => {
    if (n.kind === 'project') return PROJECT_SVG
    if (n.kind === 'folder') return n.feature ? WORKTREE_SVG : FOLDER_SVG
    return ''
  },
  iconClass: (n) =>
    n.kind === 'project' ? 'project-icon' : n.kind === 'folder' && n.feature ? 'worktree-icon' : '',
  leading: buildLeading,
  trailing: buildTrailing,
  below: buildBelow,
  aboveRow: (n) => {
    if (!n.pinned) return null
    const crumb = folderCrumb(n.id)
    return crumb ? buildCrumb(crumb) : null
  },
  rowClass: (n) => (n.kind === 'tab' && n.id === state.activeTabId ? 'active' : ''),
  isContainer: (n) => n.kind === 'folder' || n.kind === 'project',
  children: (n) => (n.kind === 'folder' || n.kind === 'project' ? n.children : []),
  collapsed: (n) => (n.kind === 'tab' ? false : n.collapsed),
  color: (n) => n.color,
  onColor: (n, c) => setNodeColor(n.id, c),
  numbered: true,
  draggable: () => true,
  renamable: () => true,
  onToggle: (n) => toggleCollapse(n.id),
  onActivate: (n) => {
    if (n.kind === 'tab') selectTab(n.id)
  },
  onClick: (n) => {
    if (n.kind !== 'tab') focusList()
  },
  onSelect: (n) => {
    if (n) state.selectedNodeId = n.id
  },
  onRename: (n, name) => setNodeName(n.id, name),
  onMove: (dragId, targetId, pos: DropPos) =>
    moveNode(dragId, targetId, pos === 'inside' ? 'into' : pos),
  menu: buildMenu
}

const tree = createTreeView<SidebarNode>(tabListEl, adapter)

// Drop on empty sidebar space -> move to root.
tabListEl.addEventListener('dragover', (e) => e.preventDefault())
tabListEl.addEventListener('drop', (e) => {
  const dragId = e.dataTransfer?.getData('text/plain')
  if (dragId) moveNode(dragId, null, 'into')
})

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

// Recursively drop pinned nodes (they render in the Pinned section instead).
// Containers are shallow-copied so the real tree is never mutated.
function stripPinned(nodes: SidebarNode[]): SidebarNode[] {
  const out: SidebarNode[] = []
  for (const n of nodes) {
    if (n.pinned) continue
    if (n.kind === 'folder' || n.kind === 'project') out.push({ ...n, children: stripPinned(n.children) })
    else out.push(n)
  }
  return out
}

// Walk a node's subtree, returning the most recent pane activity timestamp.
// Containers expose their last-touched moment via whatever terminal they hold.
function maxActivityOf(node: SidebarNode): number {
  if (node.kind === 'tab') {
    let best = 0
    for (const id of panesInLayout(node.root)) {
      const p = panes.get(id)
      if (p && p.lastActivity > best) best = p.lastActivity
    }
    return best
  }
  let best = 0
  for (const c of node.children) {
    const t = maxActivityOf(c)
    if (t > best) best = t
  }
  return best
}

// Bucket name for an activity timestamp (today / yesterday / earlier).
function recencyBucket(ts: number): 'today' | 'yesterday' | 'earlier' {
  if (!ts) return 'earlier'
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 86_400_000
  if (ts >= startOfToday) return 'today'
  if (ts >= startOfYesterday) return 'yesterday'
  return 'earlier'
}

// Build the section list: Pinned → Free (top-level terminals not under any
// project/folder) → group buckets (workspace headers + Ungrouped), OR when
// Settings → Sidebar "Group by recency" is on, Today/Yesterday/Earlier buckets
// of every top-level row.
function buildSections(): TreeSection<SidebarNode>[] {
  const sections: TreeSection<SidebarNode>[] = []

  const pinned = collectPinnedRoots(state.tree)
  if (pinned.length) sections.push({ header: sectionLabel('Pinned'), nodes: pinned })

  const main = stripPinned(state.tree)

  if (settings.sidebar.groupByRecency) {
    // Time-based bucketing across every non-pinned row (tabs + containers).
    const buckets: Record<'today' | 'yesterday' | 'earlier', SidebarNode[]> = {
      today: [],
      yesterday: [],
      earlier: []
    }
    for (const n of main) buckets[recencyBucket(maxActivityOf(n))].push(n)
    const labels: Record<'today' | 'yesterday' | 'earlier', string> = {
      today: 'Today',
      yesterday: 'Yesterday',
      earlier: 'Earlier'
    }
    for (const key of ['today', 'yesterday', 'earlier'] as const) {
      if (buckets[key].length) {
        sections.push({ header: sectionLabel(labels[key]), nodes: buckets[key] })
      }
    }
    return sections
  }

  const freeTabs = main.filter((n) => n.kind === 'tab')
  const containers = main.filter((n) => n.kind !== 'tab')
  if (freeTabs.length) {
    sections.push({ header: sectionLabel('Free'), nodes: freeTabs })
  }

  const groupOf = (n: SidebarNode): string => (isContainer(n) ? n.group || '' : '')
  if (!containers.some((n) => groupOf(n))) {
    if (containers.length) sections.push({ nodes: containers })
    return sections
  }

  const groups = new Map<string, SidebarNode[]>()
  const order: string[] = []
  for (const n of containers) {
    const g = groupOf(n)
    if (!groups.has(g)) {
      groups.set(g, [])
      order.push(g)
    }
    groups.get(g)!.push(n)
  }
  for (const g of order.filter((x) => x)) {
    sections.push({ header: groupHeader(g), nodes: groups.get(g)! })
  }
  const ungrouped = groups.get('') ?? []
  if (ungrouped.length) sections.push({ header: groupHeader('Ungrouped', true), nodes: ungrouped })
  return sections
}

export function renderSidebar(): void {
  if (sidebarMode !== 'terminal') return // those views own the list
  tree.selectedId = state.selectedNodeId
  tree.renderSections(buildSections())
}

// ---------------------------------------------------------------------------
// Light updates (no DOM rebuild — keeps interactions alive)
// ---------------------------------------------------------------------------

export function updateStatuses(): void {
  if (sidebarMode !== 'terminal') return
  tree.refreshDynamic()
}

export function updateActiveTab(): void {
  tabListEl.querySelectorAll<HTMLElement>('.tab-item[data-tree-id]').forEach((el) => {
    el.classList.toggle('active', el.dataset.treeId === state.activeTabId)
    el.classList.toggle('selected', el.dataset.treeId === state.selectedNodeId)
  })
}

// Inline-rename the currently selected sidebar node. Used by Cmd+Shift+R.
export function renameSelected(): void {
  if (state.selectedNodeId) tree.beginRename(state.selectedNodeId)
}

// ---------------------------------------------------------------------------
// Per-folder settings modal (startup command / env / shell)
// ---------------------------------------------------------------------------

function showFolderSettings(node: FolderNode | ProjectNode): void {
  const isProject = node.kind === 'project'
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal prompt-modal'
  overlay.appendChild(modal)

  const h = document.createElement('h2')
  h.textContent = (isProject ? 'Project settings — ' : 'Folder settings — ') + node.name
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
  // Projects expose name/path/command (the bits unique to a project); folders
  // don't have those — just the per-terminal defaults below.
  const nameInput = isProject ? textField('Name', node.name, 'Movve') : null
  const pathInput = isProject ? textField('Path', node.path, '~/code/movve') : null
  const commandInput = isProject
    ? textField('Command', node.command ?? '', 'claude (run on open, optional)')
    : null
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
    if (isProject && nameInput && pathInput && commandInput) {
      const projNode = node as ProjectNode
      const newName = nameInput.value.trim()
      if (newName) projNode.name = newName
      projNode.path = pathInput.value.trim()
      projNode.command = commandInput.value.trim() || undefined
    }
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
  ;(nameInput ?? startup).focus()
}

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
