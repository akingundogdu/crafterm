import type { SidebarNode, TabNode, FolderNode, ProjectNode, WorktreeNode, PaneStatus } from './types'
import { openProcessView, killProcess, startBackgroundProcess } from './bgproc'
import { state, panes, settings, paneActions } from './state'
import { persistence } from './services/storage/persistence.service'
import {
  collectPinnedRoots,
  allTabs,
  panesInLayout,
  firstPaneOf,
  ancestorFolders,
  findById,
  isContainer
} from './tree'
import { paneStatus, isPlanOwnedByPane } from './pane'
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
  runInSplit
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
  runUpdate,
  showRunningProcessesDashboard,
  showRunningDevicesDashboard
} from './pickers'
import { showImproveModal } from './improve'
import { showDailyPlanModal } from './dailyPlan'
import { promptText, promptSelect } from './dialog'
import { renderDatabase, databaseHandleKey, dbApplyQuery } from './database'
import { renderDocker, dockerHandleKey, dockerApplyQuery } from './docker'
import { renderAccounts, accountsApplyQuery, initAccounts } from './screens/accounts/accounts'
import { type ContextMenuItem } from '@crafterm/ui'
import { iosWorktreeTrailing, iosWorktreeMenuItems } from './ios-worktree'
import { isWorktreeFolder, isWorktreeContainer, worktreeProjectOf, newWorktree, removeWorktree } from './worktrees'
import { createTreeView, type TreeAdapter, type TreeSection, type DropPos } from '@crafterm/ui'
import {
  renderNotebook,
  handleNotebookKey,
  nbApplyQuery,
  nbClearQuery,
  notebookSelectFirst
} from './notebook'
import './sidebar.css'
import { fsService } from './services/ipc'
import { actionMenuRepo } from './services/storage/repositories'

const appEl = document.getElementById('app')!
const sidebarEl = document.getElementById('sidebar')!
const tabListEl = document.getElementById('tab-list')!
const searchInputEl = document.getElementById('search-input') as HTMLInputElement

let searchQuery = ''
searchInputEl.addEventListener('input', () => {
  if (sidebarMode === 'notebook') nbApplyQuery(searchInputEl.value)
  else if (sidebarMode === 'database') dbApplyQuery(searchInputEl.value)
  else if (sidebarMode === 'docker') dockerApplyQuery(searchInputEl.value)
  else if (sidebarMode === 'accounts') accountsApplyQuery(searchInputEl.value)
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
    else if (sidebarMode === 'docker') dockerApplyQuery('')
    else if (sidebarMode === 'accounts') accountsApplyQuery('')
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
  persistence.save()
}

document.getElementById('sidebar-show')!.addEventListener('click', toggleSidebar)
document.getElementById('statusbar-sidebar-toggle')!.addEventListener('click', toggleSidebar)

// One button toggles every folder: if any is open, collapse all; else expand all.
document.getElementById('toggle-all-folders')!.addEventListener('click', () => {
  setAllFoldersCollapsed(anyFolderExpanded())
})

const sidebarActionsEl = document.getElementById('sidebar-actions')!
sidebarActionsEl.addEventListener('click', (e) => {
  e.stopPropagation()
  showActionsMenu(sidebarActionsEl)
})

// Registry of built-in actions, keyed by the id stored in settings.actionMenu.
// The Settings editor picks from these; the menu invokes them here.
const BUILTIN_ACTION_RUN: Record<string, () => void> = {
  openProject: () => showProjectPicker(contextFolderId()),
  commandPalette: () => void showCommandPalette(),
  claudeSessions: () => showClaudeDashboard(),
  resumeClaude: () => void showClaudeSessionResume(),
  switchClaude: () => void showClaudeAccountSwitcher(),
  worktrees: () => void showWorktreeDashboard(),
  sshConnections: () => showSshConnections(),
  showPlans: () => void showPlansModal(),
  commandHistory: () => showCommandHistory(),
  updateZsh: () => void openTerminalRunning(settings.commands.openMyZsh, 'zsh config'),
  improve: () => void showImproveModal(),
  updateCrafterm: () => void runUpdate(),
  dailyPlan: () => showDailyPlanModal(),
  runningProcesses: () => showRunningProcessesDashboard(),
  runningDevices: () => showRunningDevicesDashboard()
}

// Flattened sidebar ⋯ action-menu entries for the global search (Cmd+J). Skips
// hidden rows and builtins whose id is no longer registered, mirroring the menu.
export function actionMenuSearchEntries(): { label: string; run: () => void }[] {
  const out: { label: string; run: () => void }[] = []
  for (const item of actionMenuRepo.getAll()) {
    if (item.hidden) continue
    if (item.kind === 'builtin' && !BUILTIN_ACTION_RUN[item.builtinId ?? '']) continue
    out.push({ label: item.title, run: () => runActionItem(item) })
  }
  return out
}

function runActionItem(item: import('./types').ActionMenuItem): void {
  if (item.kind === 'builtin') {
    BUILTIN_ACTION_RUN[item.builtinId ?? '']?.()
    return
  }
  const cmd = (item.command ?? '').trim()
  if (!cmd) return
  if (item.opensAs === 'split') void runInSplit(cmd)
  else void openTerminalRunning(cmd, item.title)
}

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
  for (const item of actionMenuRepo.getAll()) {
    if (item.hidden) continue
    // Skip builtins whose id is no longer known (e.g. after a downgrade).
    if (item.kind === 'builtin' && !BUILTIN_ACTION_RUN[item.builtinId ?? '']) continue
    addItem(item.title, () => runActionItem(item))
  }
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

function scrollSelectedIntoView(center = false): void {
  if (!state.selectedNodeId) return
  const el = tabListEl.querySelector<HTMLElement>(
    `[data-tree-id="${CSS.escape(state.selectedNodeId)}"]`
  )
  if (!el) return
  if (!center) {
    el.scrollIntoView({ block: 'nearest' })
    return
  }
  // Only scroll when the selected row is off-screen; if it's already visible,
  // leave the scroll position alone. When hidden, center it in the list.
  const elRect = el.getBoundingClientRect()
  const contRect = tabListEl.getBoundingClientRect()
  if (elRect.top < contRect.top || elRect.bottom > contRect.bottom) {
    el.scrollIntoView({ block: 'center' })
  }
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
  if (sidebarMode === 'docker') {
    dockerHandleKey(e)
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

type SidebarMode = 'terminal' | 'notebook' | 'database' | 'docker' | 'accounts'
let sidebarMode: SidebarMode = 'terminal'

const tabTerminalEl = document.getElementById('tab-terminal')!
const tabNotebookEl = document.getElementById('tab-notebook')!
const tabDatabaseEl = document.getElementById('tab-database')!
const tabDockerEl = document.getElementById('tab-docker')!
const tabAccountsEl = document.getElementById('tab-accounts')!
tabTerminalEl.addEventListener('click', () => setSidebarMode('terminal'))
tabNotebookEl.addEventListener('click', () => setSidebarMode('notebook'))
tabDatabaseEl.addEventListener('click', () => setSidebarMode('database'))
tabDockerEl.addEventListener('click', () => setSidebarMode('docker'))
tabAccountsEl.addEventListener('click', () => setSidebarMode('accounts'))
initAccounts()

export function setSidebarMode(m: SidebarMode): void {
  sidebarMode = m
  appEl.classList.toggle('mode-notebook', m === 'notebook')
  appEl.classList.toggle('mode-database', m === 'database')
  appEl.classList.toggle('mode-docker', m === 'docker')
  appEl.classList.toggle('mode-accounts', m === 'accounts')
  tabTerminalEl.classList.toggle('active', m === 'terminal')
  tabNotebookEl.classList.toggle('active', m === 'notebook')
  tabDatabaseEl.classList.toggle('active', m === 'database')
  tabDockerEl.classList.toggle('active', m === 'docker')
  tabAccountsEl.classList.toggle('active', m === 'accounts')
  // shared search bar: reset + relabel for the active view
  searchInputEl.value = ''
  searchQuery = ''
  nbClearQuery()
  dbApplyQuery('')
  dockerApplyQuery('')
  accountsApplyQuery('')
  searchInputEl.placeholder =
    m === 'notebook'
      ? 'Search notes…'
      : m === 'database'
        ? 'Search databases…'
        : m === 'docker'
          ? 'Search docker…'
          : m === 'accounts'
            ? 'Search accounts…'
            : 'Search…'
  if (m === 'notebook') void renderNotebook(tabListEl)
  else if (m === 'database') void renderDatabase(tabListEl)
  else if (m === 'docker') void renderDocker(tabListEl)
  else if (m === 'accounts') renderAccounts()
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

// Union of registered groups (settings.groups) and any group already in use on
// a container in the tree — keeps the dropdown accurate even for legacy labels.
function knownGroups(): string[] {
  const set = new Set<string>(settings.groups)
  const walk = (n: SidebarNode): void => {
    if ((n.kind === 'project' || n.kind === 'folder') && n.group) set.add(n.group)
    if (n.kind !== 'tab') n.children.forEach(walk)
  }
  state.tree.forEach(walk)
  return [...set].sort((a, b) => a.localeCompare(b))
}

// Context-menu action: pick a group/workspace for a container from a dropdown
// (or create a new one). Groups are managed in Settings → Projects → Groups.
async function promptGroup(node: FolderNode | ProjectNode): Promise<void> {
  const g = await promptSelect({
    title: 'Set group',
    label: 'Group / workspace',
    value: node.group ?? '',
    options: knownGroups(),
    emptyLabel: '(Ungrouped)',
    allowCreate: true,
    confirmText: 'Set'
  })
  if (g === null) return
  const group = g.trim()
  if (group && !settings.groups.includes(group)) {
    settings.groups.push(group)
    persistence.save()
  }
  setNodeGroup(node.id, group)
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

// Plans owned by any pane in this tab, deduped by path. A plan is owned by the
// pane whose stableId matches the filename's --pane-<uuid> tag, or whose captured
// Claude session id matches a trailing -<uuid> (see isPlanOwnedByPane). That pane
// is not necessarily the tab's first pane (the Claude session may live in any
// split), so we have to scan every pane in the layout, not just firstPaneOf.
function plansForTab(node: TabNode): import('./types').PlanEntry[] {
  const seen = new Set<string>()
  const out: import('./types').PlanEntry[] = []
  for (const id of panesInLayout(node.root)) {
    const pane = panes.get(id)
    if (!pane) continue
    for (const plan of pane.plans) {
      if (!isPlanOwnedByPane(plan, pane)) continue
      if (seen.has(plan.path)) continue
      seen.add(plan.path)
      out.push(plan)
    }
  }
  return out
}

// Is there anything to reveal under a terminal row (detail line, panes, plans)?
function tabExpandable(node: TabNode): boolean {
  if (tabDetail(node)) return true
  if (settings.sidebar.details.paneList && panesInLayout(node.root).length > 1) return true
  return plansForTab(node).length > 0
}

// leading slot: a terminal's detail chevron (if expandable).
function buildLeading(node: SidebarNode): HTMLElement | null {
  if (node.kind !== 'tab') return null
  if (!tabExpandable(node)) return null
  const wrap = document.createElement('span')
  wrap.className = 'tab-leading'
  const tri = document.createElement('span')
  tri.className = 'tri' + (node.detailsOpen ? ' expanded' : '')
  tri.innerHTML = CHEVRON_SVG
  tri.title = node.detailsOpen ? 'Hide details' : 'Show details'
  tri.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleTabDetails(node.id)
  })
  wrap.appendChild(tri)
  return wrap
}

// below slot: detail line + per-pane sub-rows (when expanded) + plan sub-rows.
// Background-process sub-rows under a worktree (the "hidden shells"): status dot,
// title, and a stop (×) button. Clicking a row opens a transient view onto the
// still-running process.
function buildWorktreeProcesses(wt: WorktreeNode | ProjectNode): HTMLElement | null {
  // Respect the node's collapse state — like plan rows, hide the process
  // sub-rows when the node is collapsed.
  if (wt.collapsed) return null
  const procs = (wt.processes ?? []).filter((p) => p.status !== 'archived')
  if (!procs.length) return null
  const frag = document.createElement('div')
  frag.className = 'tab-below'
  const list = document.createElement('div')
  list.className = 'tab-panes'
  for (const proc of procs) {
    const row = document.createElement('div')
    row.className = 'tab-pane-row'
    const title = document.createElement('span')
    title.className = 'tab-pane-title'
    title.textContent = (proc.status === 'done' ? '✓ ' : '') + proc.title
    const stop = document.createElement('button')
    stop.className = 'tab-proc-kill'
    stop.textContent = '×'
    stop.title = 'Stop process'
    stop.addEventListener('click', (e) => {
      e.stopPropagation()
      killProcess(proc.stableId)
    })
    row.append(title, stop)
    row.addEventListener('click', (e) => {
      e.stopPropagation()
      void openProcessView(proc.stableId)
    })
    list.appendChild(row)
  }
  frag.appendChild(list)
  return frag
}

// The issue key (e.g. CRF-12) for a terminal tab — from whichever pane in its
// layout is assigned to a daily task. Rendered as a "(KEY)" suffix so the title
// stays a free, renameable label (todo14).
function tabIssueKey(tab: TabNode): string | null {
  for (const id of panesInLayout(tab.root)) {
    const taskId = panes.get(id)?.dailyTaskId
    if (taskId) {
      const key = paneActions.dailyTaskIssueKey(taskId)
      if (key) return key
    }
  }
  return null
}

function buildBelow(node: SidebarNode): HTMLElement | null {
  if (node.kind === 'worktree' || node.kind === 'project') return buildWorktreeProcesses(node)
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
        const ptitle = document.createElement('span')
        ptitle.className = 'tab-pane-title'
        ptitle.textContent = p?.title || 'terminal'
        prow.append(ptitle)
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
  // mis-clicked as a terminal. A plan is attributed to whichever pane in the
  // tab owns its --pane-<uuid> suffix; legacy plans (no suffix) are ignored.
  if (node.detailsOpen) {
    const plans = plansForTab(node)
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
        ptitle.textContent = plan.slug || plan.name.replace(/\.(md|mdx|mdc)$/i, '')
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

// ---------------------------------------------------------------------------
// Tab strips display mode (icon / text / both) + per-tab hide (Settings → Tabs)
// ---------------------------------------------------------------------------

const TAB_ICON: Record<string, string> = {
  'tab-terminal':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 4l3 3-3 3M8.5 11H13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'tab-notebook':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 2.5H12v11H4.5zM4.5 2.5a1.5 1.5 0 0 0 0 11M7 5.5h3M7 8h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  'tab-database':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><ellipse cx="8" cy="4" rx="5" ry="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  'tab-docker':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 9h12v1.5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 2 10.5z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 6h1.6v2H3.5zM6.2 6h1.6v2H6.2zM8.9 6h1.6v2H8.9zM6.2 3.4h1.6v2H6.2z" fill="currentColor"/></svg>',
  'tab-accounts':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="5.5" r="2.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3.4 13c0-2.5 2-4.2 4.6-4.2s4.6 1.7 4.6 4.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  'notif-tab-notifs':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 2.5a3.4 3.4 0 0 0-3.4 3.4V8L3.2 10h9.6L11.4 8V5.9A3.4 3.4 0 0 0 8 2.5zM6.6 12a1.5 1.5 0 0 0 2.8 0" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  'notif-tab-reminders':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8.5" r="5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 5.8V8.5l2 1.4M5.5 2.5L3 4.3M10.5 2.5L13 4.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  'notif-tab-files':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 4.2c0-.6.4-1 1-1h3.1l1.2 1.4H13c.6 0 1 .4 1 1v6c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1z" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  'notif-tab-time':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 2.5h7M4.5 13.5h7M5.3 2.5c0 2.8 5.4 3.2 5.4 5.5s-5.4 2.7-5.4 5.5M10.7 2.5c0 2.8-5.4 3.2-5.4 5.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  'notif-tab-pr':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="4.5" cy="4" r="1.7" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="4.5" cy="12" r="1.7" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="11.5" cy="12" r="1.7" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 5.7v4.6M11.5 10.3V7.5a2 2 0 0 0-2-2H7.5l1.4-1.4M8.9 5.5L7.5 4.1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'notif-tab-bm':
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5 2.7h6v10.6l-3-2.3-3 2.3z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>'
}

// Every tab in the two strips, with the shortcut shown in its hover tooltip.
const TAB_META: { id: string; strip: 'left' | 'right'; label: string; shortcut?: string }[] = [
  { id: 'tab-terminal', strip: 'left', label: 'Terminal', shortcut: '⌘1' },
  { id: 'tab-notebook', strip: 'left', label: 'Notebook', shortcut: '⌘2' },
  { id: 'tab-database', strip: 'left', label: 'Database', shortcut: '⌘3' },
  { id: 'tab-docker', strip: 'left', label: 'Docker' },
  { id: 'tab-accounts', strip: 'left', label: 'Accounts' },
  { id: 'notif-tab-notifs', strip: 'right', label: 'Alerts' },
  { id: 'notif-tab-reminders', strip: 'right', label: 'Reminders' },
  { id: 'notif-tab-files', strip: 'right', label: 'Files' },
  { id: 'notif-tab-time', strip: 'right', label: 'Time' },
  { id: 'notif-tab-pr', strip: 'right', label: 'PR' },
  { id: 'notif-tab-bm', strip: 'right', label: 'Bookmarks' }
]

export function tabMeta(): typeof TAB_META {
  return TAB_META
}

// Effective tab id order for a strip: saved order (filtered to ids that still
// exist) followed by any TAB_META ids missing from it, so new tabs always show.
function tabOrder(strip: 'left' | 'right'): string[] {
  const ids = TAB_META.filter((m) => m.strip === strip).map((m) => m.id)
  const saved = settings.tabDisplay.order[strip].filter((id) => ids.includes(id))
  return [...saved, ...ids.filter((id) => !saved.includes(id))]
}

// Apply the icon/text/both mode + per-tab hide + per-strip order to both strips.
// Idempotent: the first call also wraps each button's text in an icon + label
// span and wires drag-drop reordering.
export function applyTabDisplay(): void {
  const { mode, hidden } = settings.tabDisplay
  const strips: Record<'left' | 'right', HTMLElement | null> = {
    left: document.getElementById('sidebar-tabs'),
    right: document.querySelector('.notif-tabs')
  }
  for (const key of ['left', 'right'] as const) {
    const strip = strips[key]
    if (!strip) continue
    strip.classList.remove('tabs-mode-icon', 'tabs-mode-text', 'tabs-mode-both')
    strip.classList.add('tabs-mode-' + mode)
  }
  for (const t of TAB_META) {
    const btn = document.getElementById(t.id)
    if (!btn) continue
    if (!btn.querySelector('.tab-label')) {
      const label = (btn.textContent || t.label).trim()
      btn.textContent = ''
      const icon = document.createElement('span')
      icon.className = 'tab-icon'
      icon.innerHTML = TAB_ICON[t.id] ?? ''
      const lab = document.createElement('span')
      lab.className = 'tab-label'
      lab.textContent = label
      btn.append(icon, lab)
    }
    btn.title = t.shortcut ? `${t.label} · ${t.shortcut}` : t.label
    btn.style.display = hidden[t.strip].includes(t.id) ? 'none' : ''
  }
  // Reorder buttons in the DOM to match the saved order. appendChild on an
  // existing child moves it, so the strip ends up in the desired sequence.
  for (const key of ['left', 'right'] as const) {
    const strip = strips[key]
    if (!strip) continue
    for (const id of tabOrder(key)) {
      const btn = document.getElementById(id)
      if (btn) strip.appendChild(btn)
    }
  }
  wireTabReorder(strips)
}

// One-time drag-drop wiring so tabs can be reordered within their own strip.
let tabReorderWired = false
let dragTabId: string | null = null
function wireTabReorder(strips: Record<'left' | 'right', HTMLElement | null>): void {
  if (tabReorderWired) return
  tabReorderWired = true
  const stripOf = (id: string): 'left' | 'right' | null =>
    TAB_META.find((m) => m.id === id)?.strip ?? null
  for (const key of ['left', 'right'] as const) {
    const strip = strips[key]
    if (!strip) continue
    for (const t of TAB_META.filter((m) => m.strip === key)) {
      const btn = document.getElementById(t.id)
      if (!btn) continue
      btn.draggable = true
      btn.addEventListener('dragstart', (e) => {
        dragTabId = t.id
        btn.classList.add('dragging')
        e.dataTransfer?.setData('text/plain', t.id)
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      })
      btn.addEventListener('dragend', () => {
        dragTabId = null
        strip.querySelectorAll('.dragging, .drop-target').forEach((el) => {
          el.classList.remove('dragging', 'drop-target', 'drop-after')
        })
      })
      btn.addEventListener('dragover', (e) => {
        if (!dragTabId || dragTabId === t.id || stripOf(dragTabId) !== key) return
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        const r = btn.getBoundingClientRect()
        const after = e.clientX > r.left + r.width / 2
        strip.querySelectorAll('.drop-target').forEach((el) => {
          el.classList.remove('drop-target', 'drop-after')
        })
        btn.classList.add('drop-target')
        btn.classList.toggle('drop-after', after)
      })
      btn.addEventListener('dragleave', () => {
        btn.classList.remove('drop-target', 'drop-after')
      })
      btn.addEventListener('drop', (e) => {
        if (!dragTabId || dragTabId === t.id || stripOf(dragTabId) !== key) return
        e.preventDefault()
        const r = btn.getBoundingClientRect()
        const after = e.clientX > r.left + r.width / 2
        const order = tabOrder(key).filter((id) => id !== dragTabId)
        const idx = order.indexOf(t.id)
        order.splice(after ? idx + 1 : idx, 0, dragTabId)
        settings.tabDisplay.order[key] = order
        applyTabDisplay()
        persistence.save()
      })
    }
  }
}

// Claude session state for a tab: the most "active" status among its Claude
// panes (in-progress > question > idle). Null when no Claude pane reports one.
function claudeStatusOfTab(node: TabNode): 'in-progress' | 'question' | 'idle' | null {
  let result: 'in-progress' | 'question' | 'idle' | null = null
  for (const id of panesInLayout(node.root)) {
    const p = panes.get(id)
    const s = p?.claudeStatus
    if (!s) continue
    if (s === 'in-progress') return 'in-progress'
    if (s === 'question') result = 'question'
    else if (!result) result = 'idle'
  }
  return result
}

// The intermediate daily-task status (review/test) of any pane in the tab, if
// any. Drives the badge that takes precedence over the Claude status pill.
function tabTaskBadge(node: TabNode): 'review' | 'test' | null {
  let test = false
  for (const id of panesInLayout(node.root)) {
    const taskId = panes.get(id)?.dailyTaskId
    if (!taskId) continue
    const s = paneActions.dailyTaskStatus(taskId)
    if (s === 'review') return 'review'
    if (s === 'test') test = true
  }
  return test ? 'test' : null
}

const CLAUDE_STATUS_LABEL: Record<'in-progress' | 'question' | 'idle', string> = {
  'in-progress': 'working',
  question: 'ask',
  idle: 'idle'
}
const CLAUDE_STATUS_TITLE: Record<'in-progress' | 'question' | 'idle', string> = {
  'in-progress': 'Claude is working',
  question: 'Claude is waiting on you',
  idle: 'Claude is idle'
}

// trailing slot: Claude status pill + folder child-count badge + pin badge.
function buildTrailing(node: SidebarNode): HTMLElement | null {
  const wrap = document.createElement('span')
  // iOS worktree folder → ▶/⋯ build-run actions.
  const iosActions = iosWorktreeTrailing(node)
  if (iosActions) wrap.appendChild(iosActions)
  // Worktrees container → quick "+ new worktree".
  if (isWorktreeContainer(node)) {
    const proj = worktreeProjectOf(node)
    if (proj) {
      const add = document.createElement('button')
      add.className = 'ios-wt-act'
      add.textContent = '+'
      add.title = 'New worktree'
      add.addEventListener('click', (e) => {
        e.stopPropagation()
        void newWorktree(proj)
      })
      wrap.appendChild(add)
    }
  }
  if (node.kind === 'tab') {
    // A code-review/test task overrides the Claude status pill with its badge.
    const taskBadge = tabTaskBadge(node)
    if (taskBadge) {
      const chip = document.createElement('span')
      chip.className = 'claude-status claude-' + taskBadge
      chip.textContent = taskBadge
      chip.title = taskBadge === 'review' ? 'Ticket is in code review' : 'Ticket is in test'
      wrap.appendChild(chip)
    } else {
      const cs = claudeStatusOfTab(node)
      if (cs) {
        const chip = document.createElement('span')
        chip.className = 'claude-status claude-' + cs
        chip.textContent = CLAUDE_STATUS_LABEL[cs]
        chip.title = CLAUDE_STATUS_TITLE[cs]
        wrap.appendChild(chip)
      }
    }
  }
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
  if (node.kind === 'tab' && node.status === 'archived') {
    // Archived session (shown only under "Show archived items"): reactivate it.
    // Never permanently deleted — that's the whole point of archiving.
    items.push({ label: 'Restore session', run: () => paneActions.reactivateTab(node.id) })
  } else if (node.kind === 'tab') {
    const trail = ancestorFolders(state.tree, node.id)
    const parentId = trail && trail.length ? trail[trail.length - 1].id : null
    items.push({ label: 'New Claude terminal', run: () => void newClaudeTab(parentId) })
    items.push({ label: 'Rename', run: () => tree.beginRename(node.id) })
    if (node.titleLocked) items.push({ label: 'Auto-name', run: () => autoNameTab(node.id) })
    items.push({ label: node.pinned ? 'Unpin' : 'Pin', run: () => togglePin(node.id) })
    items.push({ label: 'Close tab', run: () => closeTab(node.id), danger: true })
  } else if (isWorktreeFolder(node)) {
    // A worktree node: a dedicated, type-aware menu — git-managed, so the generic
    // folder operations (subfolder / rename / delete folder / settings) don't apply.
    const wt = node.worktreePath
    const proj = worktreeProjectOf(node)
    items.push({ label: 'New terminal here', run: () => void newTab(node.id, wt) })
    items.push({ label: 'New Claude terminal here', run: () => void newClaudeTab(node.id, wt) })
    items.push({
      label: 'Run in background…',
      run: () =>
        void promptText({
          title: 'Run in background',
          label: 'Command',
          placeholder: 'command',
          confirmText: 'Run'
        }).then(
          (command) => {
            const cmd = command?.trim()
            if (cmd) void startBackgroundProcess(node, { title: cmd, command: cmd, role: 'shell' })
          }
        )
    })
    for (const it of iosWorktreeMenuItems(node)) items.push(it)
    items.push({ label: 'Reveal in Finder', run: () => fsService.revealPath(wt) })
    if (proj) {
      items.push({ label: 'Delete worktree', danger: true, run: () => void removeWorktree(proj, wt) })
    }
  } else if (isWorktreeContainer(node)) {
    // The auto "worktrees" container: only "new worktree" (it's auto-managed).
    const proj = worktreeProjectOf(node)
    if (proj) items.push({ label: 'New worktree…', run: () => void newWorktree(proj) })
    items.push({ label: node.collapsed ? 'Expand' : 'Collapse', run: () => toggleCollapse(node.id) })
  } else {
    // A project node opens its terminals at the project's path; other folders
    // inherit the active terminal's cwd (the legacy behaviour).
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
  items.push({
    label: showArchivedView ? 'Show active items' : 'Show archived items',
    run: () => toggleArchivedView()
  })
  return items
}

// ---------------------------------------------------------------------------
// Archived-view filtering (never-delete model): archived sessions stay in the
// tree but are hidden by default; "Show archived items" flips to show only them.
// ---------------------------------------------------------------------------

let showArchivedView = false

function isArchivedTab(n: SidebarNode): boolean {
  return n.kind === 'tab' && n.status === 'archived'
}
// A node that is itself archived: a closed session (tab) or a removed worktree.
function isArchivedNode(n: SidebarNode): boolean {
  return (n.kind === 'tab' || n.kind === 'worktree') && n.status === 'archived'
}
function hasArchivedDescendant(n: SidebarNode): boolean {
  if (isArchivedNode(n)) return true
  if (n.kind === 'folder' || n.kind === 'project' || n.kind === 'worktree')
    return n.children.some(hasArchivedDescendant)
  return false
}
function passesArchiveFilter(n: SidebarNode): boolean {
  if (showArchivedView) {
    if (n.kind === 'tab') return isArchivedTab(n)
    if (n.kind === 'worktree') return n.status === 'archived' || hasArchivedDescendant(n)
    return hasArchivedDescendant(n)
  }
  // Normal view: hide archived sessions and archived (removed) worktrees.
  if (n.kind === 'tab') return !isArchivedTab(n)
  if (n.kind === 'worktree') return n.status !== 'archived'
  return true
}

export function toggleArchivedView(): void {
  showArchivedView = !showArchivedView
  renderSidebar()
}

// ---------------------------------------------------------------------------
// The terminal TreeView
// ---------------------------------------------------------------------------

const adapter: TreeAdapter<SidebarNode> = {
  id: (n) => n.id,
  label: (n) => {
    if (n.kind !== 'tab') return n.name
    const key = tabIssueKey(n)
    return key ? `${n.title} (${key})` : n.title
  },
  icon: (n) => {
    if (n.kind === 'project') return PROJECT_SVG
    if (n.kind === 'worktree') return WORKTREE_SVG
    if (n.kind === 'folder') return n.feature ? WORKTREE_SVG : FOLDER_SVG
    return ''
  },
  iconClass: (n) =>
    n.kind === 'project'
      ? 'project-icon'
      : n.kind === 'worktree' || (n.kind === 'folder' && n.feature)
        ? 'worktree-icon'
        : '',
  leading: buildLeading,
  trailing: buildTrailing,
  below: buildBelow,
  aboveRow: (n) => {
    if (!n.pinned) return null
    const crumb = folderCrumb(n.id)
    return crumb ? buildCrumb(crumb) : null
  },
  rowClass: (n) => {
    if (n.kind === 'worktree' && n.archiving) return 'worktree-archiving'
    return n.kind === 'tab' && n.id === state.activeTabId ? 'active' : ''
  },
  isContainer: (n) => n.kind === 'folder' || n.kind === 'project' || n.kind === 'worktree',
  children: (n) =>
    n.kind === 'folder' || n.kind === 'project' || n.kind === 'worktree'
      ? n.children.filter(passesArchiveFilter)
      : [],
  collapsed: (n) => (n.kind === 'tab' ? false : n.collapsed),
  color: (n) => n.color,
  onColor: (n, c) => setNodeColor(n.id, c),
  numbered: false,
  draggable: () => true,
  renamable: () => true,
  onToggle: (n) => toggleCollapse(n.id),
  onActivate: (n) => {
    if (n.kind !== 'tab') return
    // Clicking an archived session reactivates it rather than selecting an empty
    // (dormant) tab.
    if (n.status === 'archived') paneActions.reactivateTab(n.id)
    else selectTab(n.id)
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

  const pinned = collectPinnedRoots(state.tree).filter(passesArchiveFilter)
  if (pinned.length) sections.push({ header: sectionLabel('Pinned'), nodes: pinned })

  const main = stripPinned(state.tree).filter(passesArchiveFilter)

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
  // Reveal the focused terminal's row: if it scrolled out of view, center it.
  scrollSelectedIntoView(true)
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
    persistence.save()
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
  persistence.save()
}

export function resetSidebarFontSize(): void {
  settings.sidebar.fontSize = 13
  applySidebarFont()
  persistence.save()
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
