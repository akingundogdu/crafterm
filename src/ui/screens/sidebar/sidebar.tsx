import type { SidebarNode, TabNode, FolderNode, ProjectNode, WorktreeNode } from '@ui/types/types'
import { UITexts } from '@texts'
import { startBackgroundProcess } from '@services/bgproc'
import { state, panes, settings, paneActions } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'
import { collectPinnedRoots, allTabs, panesInLayout, ancestorFolders, findById, isContainer } from '@ui/tree/tree'
import {
  selectTab,
  selectNode,
  closeTab,
  togglePin,
  toggleCollapse,
  setAllFoldersCollapsed,
  anyFolderExpanded,
  deleteFolder,
  newTab,
  newClaudeTab,
  newFolder,
  setNodeColor,
  setNodeName,
  autoNameTab,
  moveNode,
  setNodeGroup
} from '@ui/commands/commands'
import { showRunApps, showFeatureSetup, showRunCommand } from '../pickers/project/project'
import { promptText, promptSelect } from '@ui/components/dialog/dialog'
import { renderDatabase, databaseHandleKey, dbApplyQuery } from '../database/database'
import { renderDocker, dockerHandleKey, dockerApplyQuery } from '../docker/docker'
import { renderAccounts, accountsApplyQuery } from '../accounts/accounts'
import { type ContextMenuItem } from '@ui/components'
import { iosWorktreeTrailing, iosWorktreeMenuItems } from '../ios-worktree/ios-worktree'
import { isWorktreeFolder, isWorktreeContainer, worktreeProjectOf, newWorktree, removeWorktree } from '@services/worktrees'
import { createTreeView, createOverlay, type TreeAdapter, type TreeSection, type DropPos } from '@ui/components'
import { renderNotebook, handleNotebookKey, nbApplyQuery, nbClearQuery, notebookSelectFirst } from '@ui/notebook/notebook'
import './sidebar.css'
import { shellService } from '@services'
import { actionMenuRepo } from '@repositories'
import type { SidebarMode, Crumb } from './sidebar.types'
import {
  CHEVRON_SVG,
  FOLDER_SVG,
  PROJECT_SVG,
  PLAN_SVG,
  WORKTREE_SVG,
  CLAUDE_STATUS_LABEL,
  CLAUDE_STATUS_TITLE,
  TAB_ICON,
  TAB_META,
  tabOrder,
  tabDetail,
  tabExpandable,
  plansForTab,
  claudeStatusOfTab,
  tabTaskBadge,
  tabIssueKey,
  folderCrumb,
  knownGroups,
  recencyBucket,
  maxActivityOf,
  stripPinned,
  isArchivedTab,
  hasArchivedDescendant,
  BUILTIN_ACTION_RUN,
  runActionItem,
  makeToggleDetails,
  makeProcessRowClick,
  makeKillProcess,
  makePaneRowClick,
  makePlanRowClick,
  makeNewWorktreeClick
} from './sidebar.state'

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
// #statusbar-sidebar-toggle is wired by the status bar component (mountStatusBar)

// One button toggles every folder: if any is open, collapse all; else expand all.
document.getElementById('toggle-all-folders')!.addEventListener('click', () => {
  setAllFoldersCollapsed(anyFolderExpanded())
})

const sidebarActionsEl = document.getElementById('sidebar-actions')!
sidebarActionsEl.addEventListener('click', (e) => {
  e.stopPropagation()
  showActionsMenu(sidebarActionsEl)
})

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
  const el = tabListEl.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(state.selectedNodeId)}"]`)
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

// ---------------------------------------------------------------------------
// Sidebar mode (terminal / notebook / database)
// ---------------------------------------------------------------------------

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
  return (<div class="section-label">{text}</div>) as HTMLDivElement
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

function buildCrumb(crumb: Crumb): HTMLElement {
  return (
    <div class="tab-crumb">
      <span
        class="crumb-dot"
        ref={(el: HTMLSpanElement) => {
          if (crumb.color) el.style.background = crumb.color
        }}
      />
      <span class="crumb-text">{crumb.text}</span>
    </div>
  ) as HTMLDivElement
}

// Context-menu action: pick a group/workspace for a container from a dropdown
// (or create a new one). Groups are managed in Settings → Projects → Groups.
async function promptGroup(node: FolderNode | ProjectNode): Promise<void> {
  const g = await promptSelect({
    title: 'Set group',
    label: UITexts.Sidebar.groupWorkspace,
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
  return (
    <span class="pin-badge" title={UITexts.Sidebar.pinnedTitle}>
      ●
    </span>
  ) as HTMLSpanElement
}

// leading slot: a terminal's detail chevron (if expandable).
function buildLeading(node: SidebarNode): HTMLElement | null {
  if (node.kind !== 'tab') return null
  if (!tabExpandable(node)) return null
  const tri = (
    <span
      class={'treeview-chevron' + (node.detailsOpen ? ' expanded' : '')}
      innerHTML={CHEVRON_SVG}
      title={node.detailsOpen ? UITexts.Sidebar.hideDetails : UITexts.Sidebar.showDetails}
      onClick={makeToggleDetails(node)}
    />
  ) as HTMLSpanElement
  return (<span class="tab-leading">{tri}</span>) as HTMLSpanElement
}

// below slot: background-process sub-rows under a worktree (the "hidden shells").
function buildWorktreeProcesses(wt: WorktreeNode | ProjectNode): HTMLElement | null {
  // Respect the node's collapse state — like plan rows, hide the process
  // sub-rows when the node is collapsed.
  if (wt.collapsed) return null
  const procs = (wt.processes ?? []).filter((p) => p.status !== 'archived')
  if (!procs.length) return null
  const rows = procs.map(
    (proc) =>
      (
        <div class="tab-pane-row" onClick={makeProcessRowClick(proc.stableId)}>
          <span class="tab-pane-title">{(proc.status === 'done' ? '✓ ' : '') + proc.title}</span>
          <button class="tab-proc-kill" title={UITexts.Sidebar.stopProcess} onClick={makeKillProcess(proc.stableId)}>
            ×
          </button>
        </div>
      ) as HTMLDivElement
  )
  return (
    <div class="tab-below">
      <div class="tab-panes">{rows}</div>
    </div>
  ) as HTMLDivElement
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
      frag.appendChild((<div class="tab-sub">{detail}</div>) as HTMLDivElement)
    }
    if (showPanes) {
      const prows = paneIds.map((id) => {
        const p = panes.get(id)
        return (
          <div class="tab-pane-row" onClick={makePaneRowClick(id)}>
            <span class="tab-pane-title">{p?.title || 'terminal'}</span>
          </div>
        ) as HTMLDivElement
      })
      frag.appendChild((<div class="tab-panes">{prows}</div>) as HTMLDivElement)
    }
  }

  // Plan files for this terminal's branch. Only shown when the user has
  // expanded the tab's detail line, so plans don't sit between rows and get
  // mis-clicked as a terminal.
  if (node.detailsOpen) {
    const plans = plansForTab(node)
    if (plans.length) {
      const prows = plans.map(
        (plan) =>
          (
            <div
              class="tab-plan-row"
              title={plan.path}
              onMouseDown={(e: MouseEvent) => e.stopPropagation()}
              onClick={makePlanRowClick(plan.path)}
            >
              <span class="tab-plan-icon" innerHTML={PLAN_SVG} />
              <span class="tab-plan-title">{plan.slug || plan.name.replace(/\.(md|mdx|mdc)$/i, '')}</span>
            </div>
          ) as HTMLDivElement
      )
      frag.appendChild((<div class="tab-plans">{prows}</div>) as HTMLDivElement)
    }
  }

  return frag.childElementCount ? frag : null
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
      wrap.appendChild(
        (
          <button class="ios-wt-act" title={UITexts.Sidebar.newWorktreeTitle} onClick={makeNewWorktreeClick(proj)}>
            +
          </button>
        ) as HTMLButtonElement
      )
    }
  }
  if (node.kind === 'tab') {
    // A code-review/test task overrides the Claude status pill with its badge.
    const taskBadge = tabTaskBadge(node)
    if (taskBadge) {
      wrap.appendChild(
        (
          <span
            class={'claude-status claude-' + taskBadge}
            title={taskBadge === 'review' ? 'Ticket is in code review' : 'Ticket is in test'}
          >
            {taskBadge}
          </span>
        ) as HTMLSpanElement
      )
    } else {
      const cs = claudeStatusOfTab(node)
      if (cs) {
        wrap.appendChild(
          (
            <span class={'claude-status claude-' + cs} title={CLAUDE_STATUS_TITLE[cs]}>
              {CLAUDE_STATUS_LABEL[cs]}
            </span>
          ) as HTMLSpanElement
        )
      }
    }
  }
  if (node.kind === 'folder' || node.kind === 'project') {
    wrap.appendChild((<span class="tab-badge">{String(allTabs([node]).length)}</span>) as HTMLSpanElement)
  }
  if (node.pinned) wrap.appendChild(pinBadge())
  return wrap.childElementCount ? wrap : null
}

// ---------------------------------------------------------------------------
// Tab strips display mode (icon / text / both) + per-tab hide (Settings → Tabs)
// ---------------------------------------------------------------------------

export function tabMeta(): typeof TAB_META {
  return TAB_META
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
  const stripOf = (id: string): 'left' | 'right' | null => TAB_META.find((m) => m.id === id)?.strip ?? null
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

// ---------------------------------------------------------------------------
// Context menu (per-node items; color swatch is added by the tree)
// ---------------------------------------------------------------------------

function buildMenu(node: SidebarNode): ContextMenuItem[] {
  const items: ContextMenuItem[] = []
  if (node.kind === 'tab' && node.status === 'archived') {
    // Archived session (shown only under "Show archived items"): reactivate it.
    items.push({ label: UITexts.Sidebar.menu.restoreSession, run: () => paneActions.reactivateTab(node.id) })
  } else if (node.kind === 'tab') {
    const trail = ancestorFolders(state.tree, node.id)
    const parentId = trail && trail.length ? trail[trail.length - 1].id : null
    items.push({ label: UITexts.Sidebar.menu.newClaudeTerminal, run: () => void newClaudeTab(parentId) })
    items.push({ label: UITexts.Sidebar.menu.rename, run: () => tree.beginRename(node.id) })
    if (node.titleLocked) items.push({ label: UITexts.Sidebar.menu.autoName, run: () => autoNameTab(node.id) })
    items.push({ label: node.pinned ? 'Unpin' : 'Pin', run: () => togglePin(node.id) })
    items.push({ label: UITexts.Sidebar.menu.closeTab, run: () => closeTab(node.id), danger: true })
  } else if (isWorktreeFolder(node)) {
    // A worktree node: a dedicated, type-aware menu — git-managed, so the generic
    // folder operations don't apply.
    const wt = node.worktreePath
    const proj = worktreeProjectOf(node)
    items.push({ label: UITexts.Sidebar.menu.newTerminalHere, run: () => void newTab(node.id, wt) })
    items.push({ label: UITexts.Sidebar.menu.newClaudeTerminalHere, run: () => void newClaudeTab(node.id, wt) })
    items.push({
      label: UITexts.Sidebar.menu.runInBackground,
      run: () =>
        void promptText({
          title: 'Run in background',
          label: UITexts.Sidebar.menu.command,
          placeholder: UITexts.Sidebar.commandPlaceholder,
          confirmText: 'Run'
        }).then((command) => {
          const cmd = command?.trim()
          if (cmd) void startBackgroundProcess(node, { title: cmd, command: cmd, role: 'shell' })
        })
    })
    for (const it of iosWorktreeMenuItems(node)) items.push(it)
    items.push({ label: UITexts.Sidebar.menu.revealInFinder, run: () => shellService.revealPath(wt) })
    if (proj) {
      items.push({ label: UITexts.Sidebar.menu.deleteWorktree, danger: true, run: () => void removeWorktree(proj, wt) })
    }
  } else if (isWorktreeContainer(node)) {
    // The auto "worktrees" container: only "new worktree" (it's auto-managed).
    const proj = worktreeProjectOf(node)
    if (proj) items.push({ label: UITexts.Sidebar.menu.newWorktree, run: () => void newWorktree(proj) })
    items.push({ label: node.collapsed ? 'Expand' : 'Collapse', run: () => toggleCollapse(node.id) })
  } else {
    // A project node opens its terminals at the project's path; other folders
    // inherit the active terminal's cwd (the legacy behaviour).
    const cwd = node.kind === 'project' ? node.path : undefined
    items.push({ label: UITexts.Sidebar.menu.newTerminalHere, run: () => void newTab(node.id, cwd) })
    items.push({ label: UITexts.Sidebar.menu.newClaudeTerminalHere, run: () => void newClaudeTab(node.id, cwd) })
    items.push({ label: UITexts.Sidebar.menu.newSubfolder, run: () => void newFolder(node.id) })
    if (node.kind === 'project') {
      items.push({ label: UITexts.Sidebar.menu.runApplications, run: () => showRunApps(node) })
      if (node.runCommands && node.runCommands.length) {
        items.push({ label: UITexts.Sidebar.menu.runCommand, run: () => showRunCommand(node) })
      }
      items.push({ label: UITexts.Sidebar.menu.newFeature, run: () => showFeatureSetup(node) })
    }
    items.push({ label: UITexts.Sidebar.menu.rename, run: () => tree.beginRename(node.id) })
    items.push({ label: UITexts.Sidebar.menu.setGroup, run: () => void promptGroup(node) })
    items.push({ label: UITexts.Sidebar.menu.folderSettings, run: () => showFolderSettings(node) })
    items.push({ label: node.pinned ? 'Unpin' : 'Pin', run: () => togglePin(node.id) })
    items.push({ label: UITexts.Sidebar.menu.deleteFolder, run: () => deleteFolder(node.id), danger: true })
  }
  items.push({
    label: showArchivedView ? UITexts.Sidebar.showActiveItems : UITexts.Sidebar.showArchivedItems,
    run: () => toggleArchivedView()
  })
  return items
}

// ---------------------------------------------------------------------------
// Archived-view filtering (never-delete model)
// ---------------------------------------------------------------------------

let showArchivedView = false

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
  onMove: (dragId, targetId, pos: DropPos) => moveNode(dragId, targetId, pos === 'inside' ? 'into' : pos),
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

// Build the section list: Pinned → Free → group buckets (or recency buckets).
function buildSections(): TreeSection<SidebarNode>[] {
  const sections: TreeSection<SidebarNode>[] = []

  const pinned = collectPinnedRoots(state.tree).filter(passesArchiveFilter)
  if (pinned.length) sections.push({ header: sectionLabel(UITexts.Sidebar.sections.pinned), nodes: pinned })

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
    sections.push({ header: sectionLabel(UITexts.Sidebar.sections.free), nodes: freeTabs })
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
  const { overlay, mount, close } = createOverlay()
  const modal = document.createElement('div')
  modal.className = 'modal modal-prompt'
  overlay.appendChild(modal)

  modal.appendChild(
    (<h2>{(isProject ? 'Project settings — ' : 'Folder settings — ') + node.name}</h2>) as HTMLHeadingElement
  )

  const textField = (label: string, value: string, ph: string): HTMLInputElement => {
    const i = (<input type="text" placeholder={ph} />) as HTMLInputElement
    i.value = value
    modal.appendChild(
      (
        <div class="field">
          <label>{label}</label>
          {i}
        </div>
      ) as HTMLDivElement
    )
    return i
  }
  // Projects expose name/path/command (the bits unique to a project); folders
  // don't have those — just the per-terminal defaults below.
  const nameInput = isProject ? textField('Name', node.name, 'Movve') : null
  const pathInput = isProject ? textField('Path', node.path, '~/code/movve') : null
  const commandInput = isProject ? textField('Command', node.command ?? '', 'claude (run on open, optional)') : null
  const startup = textField('Startup command', node.startup ?? '', 'e.g. claude')
  const shell = textField('Shell', node.shell ?? '', '(default)')

  const env = (<textarea class="folder-env" placeholder={'FOO=bar\nNODE_ENV=development'} />) as HTMLTextAreaElement
  env.value = node.env ?? ''
  env.rows = 4
  modal.appendChild(
    (
      <div class="field field-col">
        <label>Environment (KEY=VALUE per line)</label>
        {env}
      </div>
    ) as HTMLDivElement
  )

  const cancel = (<button>{UITexts.Sidebar.cancel}</button>) as HTMLButtonElement
  const save = (<button class="button-primary">{UITexts.Sidebar.save}</button>) as HTMLButtonElement
  modal.appendChild(
    (
      <div class="modal-actions">
        {cancel}
        {save}
      </div>
    ) as HTMLDivElement
  )

  cancel.addEventListener('click', close)
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
  modal.querySelectorAll('input, textarea').forEach((el) => el.addEventListener('keydown', (e) => e.stopPropagation()))

  mount()
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
