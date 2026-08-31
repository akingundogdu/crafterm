import type {
  SidebarNode,
  TabNode,
  ProjectNode,
  PaneStatus,
  PlanEntry,
  ActionMenuItem
} from '@views/types/types'
import { UITexts } from '@texts'
import { openProcessView, killProcess } from '@services/bgproc'
import { state, panes, settings, paneActions, renderContent, requestSidebar } from '@views/state/spine'
import { setSideBySide, exitSideBySide } from '@views/screens/content/content.store'
import { allTabs, panesInLayout, firstPaneOf, ancestorFolders, isContainer } from '@views/tree/tree'
import { paneStatus, isPlanOwnedByPane } from '@views/pane/pane'
import {
  selectPane,
  openMarkdownFile,
  toggleTabDetails,
  openTerminalRunning,
  contextFolderId,
  runInSplit
} from '@views/commands/commands'
import { showProjectPicker } from '@views/screens/pickers/project/project'
import { runUpdate } from '@views/screens/pickers/update/update'
import { showCommandPalette, showCommandHistory } from '@views/screens/pickers/command/command'
import { showSshConnections } from '@views/screens/pickers/ssh/ssh'
import {
  showClaudeDashboard,
  showClaudeAccountSwitcher,
  showClaudeSessionResume
} from '@views/screens/pickers/claude/claude'
import { showPlansModal } from '@views/screens/pickers/plans/plans'
import { showWorktreeDashboard } from '@views/screens/pickers/worktree/worktree'
import { showRunningProcessesDashboard, showRunningDevicesDashboard } from '@views/screens/pickers/processes/processes'
import { showImproveModal } from '@views/screens/improve-crafterm/improve-crafterm.store'
import { showDailyPlanModal } from '@views/screens/daily-plan/daily-plan.entry'
import { newWorktree } from '@services/worktrees'
import type { Crumb } from './sidebar.types'

// ---- Icons + labels --------------------------------------------------------
// Crisp disclosure chevron — CSS rotates it 90° when expanded.
export const CHEVRON_SVG =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>'
// Folder glyph shown on group rows (file-explorer look).
export const FOLDER_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1.6 4.4c0-.6.4-1 1-1h3.1l1.2 1.4H13.4c.6 0 1 .4 1 1V11.6c0 .6-.4 1-1 1H2.6c-.6 0-1-.4-1-1z" fill="currentColor"/></svg>'
// project icon: a stack/box, distinct from the folder
export const PROJECT_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M8 1.5l5.5 3.1v6.8L8 14.5 2.5 11.4V4.6z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M2.6 4.7L8 7.8l5.4-3.1M8 7.8v6.5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/></svg>'
// plan-file glyph (document) shown on plan sub-rows under a terminal node
export const PLAN_SVG =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M4 1.5h5l3 3v10H4z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M9 1.5v3h3M6 8h4M6 10.5h4" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>'
// feature/worktree folder icon: a git-branch glyph (marks a worktree feature)
export const WORKTREE_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="4.5" cy="3.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="4.5" cy="12.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="11.5" cy="3.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 5.1v5.8M11.5 5.1v1.2c0 2.2-1.8 3.4-3.9 3.9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'

export const STATUS_LABEL: Record<PaneStatus, string> = {
  running: 'running',
  idle: 'idle',
  attention: 'needs input'
}

export const CLAUDE_STATUS_LABEL: Record<'in-progress' | 'question' | 'idle', string> = {
  'in-progress': 'working',
  question: 'ask',
  idle: 'idle'
}
export const CLAUDE_STATUS_TITLE: Record<'in-progress' | 'question' | 'idle', string> = {
  'in-progress': 'Claude is working',
  question: 'Claude is waiting on you',
  idle: 'Claude is idle'
}

export const TAB_ICON: Record<string, string> = {
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
export const TAB_META: { id: string; strip: 'left' | 'right'; label: string; shortcut?: string }[] = [
  { id: 'tab-terminal', strip: 'left', label: UITexts.Sidebar.tabs.terminal, shortcut: '⌘1' },
  { id: 'tab-notebook', strip: 'left', label: UITexts.Sidebar.tabs.notebook, shortcut: '⌘2' },
  { id: 'tab-database', strip: 'left', label: UITexts.Sidebar.tabs.database, shortcut: '⌘3' },
  { id: 'tab-docker', strip: 'left', label: UITexts.Sidebar.tabs.docker },
  { id: 'tab-accounts', strip: 'left', label: UITexts.Sidebar.tabs.accounts },
  { id: 'notif-tab-notifs', strip: 'right', label: UITexts.Sidebar.tabs.alerts },
  { id: 'notif-tab-reminders', strip: 'right', label: UITexts.Sidebar.tabs.reminders },
  { id: 'notif-tab-files', strip: 'right', label: UITexts.Sidebar.tabs.files },
  { id: 'notif-tab-time', strip: 'right', label: UITexts.Sidebar.tabs.time },
  { id: 'notif-tab-pr', strip: 'right', label: UITexts.Sidebar.tabs.pr },
  { id: 'notif-tab-bm', strip: 'right', label: UITexts.Sidebar.tabs.bookmarks }
]

// Effective tab id order for a strip: saved order (filtered to ids that still
// exist) followed by any TAB_META ids missing from it, so new tabs always show.
export function tabOrder(strip: 'left' | 'right'): string[] {
  const ids = TAB_META.filter((m) => m.strip === strip).map((m) => m.id)
  const saved = settings.tabDisplay.order[strip].filter((id) => ids.includes(id))
  return [...saved, ...ids.filter((id) => !saved.includes(id))]
}

// ---- Status / detail helpers (pure over the node + global store) -----------
export function statusOfNode(node: SidebarNode): PaneStatus {
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

export function tabDetail(node: TabNode): string {
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

// Plans owned by any pane in this tab, deduped by path.
export function plansForTab(node: TabNode): PlanEntry[] {
  const seen = new Set<string>()
  const out: PlanEntry[] = []
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
export function tabExpandable(node: TabNode): boolean {
  if (tabDetail(node)) return true
  if (settings.sidebar.details.paneList && panesInLayout(node.root).length > 1) return true
  return plansForTab(node).length > 0
}

// The issue key (e.g. CRF-12) for a terminal tab — from whichever pane in its
// layout is assigned to a daily task.
export function tabIssueKey(tab: TabNode): string | null {
  for (const id of panesInLayout(tab.root)) {
    const taskId = panes.get(id)?.dailyTaskId
    if (taskId) {
      const key = paneActions.dailyTaskIssueKey(taskId)
      if (key) return key
    }
  }
  return null
}

// Drop a redundant leading issue-key prefix from a tab title so the row shows
// the descriptive part (the key is surfaced separately as a badge). Worktree
// branches are named `<KEY>-<slug>`, so the key duplicates in the label. Falls
// back to the original title when stripping would leave it empty.
export function stripIssuePrefix(title: string, key: string): string {
  if (!title.toLowerCase().startsWith(key.toLowerCase())) return title
  const rest = title.slice(key.length).replace(/^[-_/\s]+/, '')
  return rest || title
}

// Claude session state for a tab: the most "active" status among its Claude panes.
export function claudeStatusOfTab(node: TabNode): 'in-progress' | 'question' | 'idle' | null {
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

// The intermediate daily-task status (review/test) of any pane in the tab, if any.
export function tabTaskBadge(node: TabNode): 'review' | 'test' | null {
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

// Group path of a node ("Movve / Mobil") — shown in the Pinned section.
export function folderCrumb(id: string): Crumb | null {
  const trail = ancestorFolders(state.tree, id)
  if (!trail || trail.length === 0) return null
  return {
    text: trail.map((f) => f.name).join(' / '),
    color: [...trail].reverse().find((f) => f.color)?.color ?? null
  }
}

// Union of registered groups (settings.groups) and any group already in use.
export function knownGroups(): string[] {
  const set = new Set<string>(settings.groups)
  const walk = (n: SidebarNode): void => {
    if ((n.kind === 'project' || n.kind === 'folder') && n.group) set.add(n.group)
    if (n.kind !== 'tab') n.children.forEach(walk)
  }
  state.tree.forEach(walk)
  return [...set].sort((a, b) => a.localeCompare(b))
}

// ---- Sectioning helpers ----------------------------------------------------
// Recursively drop pinned nodes (they render in the Pinned section instead).
export function stripPinned(nodes: SidebarNode[]): SidebarNode[] {
  const out: SidebarNode[] = []
  for (const n of nodes) {
    if (n.pinned) continue
    if (isContainer(n)) out.push({ ...n, children: stripPinned(n.children) })
    else out.push(n)
  }
  return out
}

// Walk a node's subtree, returning the most recent pane activity timestamp.
export function maxActivityOf(node: SidebarNode): number {
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
export function recencyBucket(ts: number): 'today' | 'yesterday' | 'earlier' {
  if (!ts) return 'earlier'
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 86_400_000
  if (ts >= startOfToday) return 'today'
  if (ts >= startOfYesterday) return 'yesterday'
  return 'earlier'
}

// ---- Archived-view predicates ----------------------------------------------
export function isArchivedTab(n: SidebarNode): boolean {
  return n.kind === 'tab' && n.status === 'archived'
}
// A node that is itself archived: a closed session (tab) or a removed worktree.
export function isArchivedNode(n: SidebarNode): boolean {
  return (n.kind === 'tab' || n.kind === 'worktree') && n.status === 'archived'
}
export function hasArchivedDescendant(n: SidebarNode): boolean {
  if (isArchivedNode(n)) return true
  if (n.kind === 'folder' || n.kind === 'project' || n.kind === 'worktree')
    return n.children.some(hasArchivedDescendant)
  return false
}

// ---- Built-in action registry ----------------------------------------------
// Registry of built-in actions, keyed by the id stored in settings.actionMenu.
export const BUILTIN_ACTION_RUN: Record<string, () => void> = {
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

export function runActionItem(item: ActionMenuItem): void {
  if (item.kind === 'builtin') {
    BUILTIN_ACTION_RUN[item.builtinId ?? '']?.()
    return
  }
  const cmd = (item.command ?? '').trim()
  if (!cmd) return
  if (item.opensAs === 'split') void runInSplit(cmd)
  else void openTerminalRunning(cmd, item.title)
}

// ---- Slot-row handler factories (R4) ---------------------------------------
export function makeToggleDetails(node: TabNode): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    toggleTabDetails(node.id)
  }
}

export function makeProcessRowClick(stableId: string): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    void openProcessView(stableId)
  }
}

export function makeKillProcess(stableId: string): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    killProcess(stableId)
  }
}

export function makePaneRowClick(id: string): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    selectPane(id)
  }
}

export function makePlanRowClick(path: string): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    openMarkdownFile(path)
  }
}

export function makeNewWorktreeClick(proj: ProjectNode): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    void newWorktree(proj)
  }
}

// ---- Multi-select (todomraex8usk1) -----------------------------------------
// Cmd/Ctrl+click marks extra terminals in the sidebar. The set is view-only — it
// is never persisted and it does not move a terminal out of its tab; the content
// area just tiles the marked ones side by side until another terminal is picked.
const multiSelected = new Set<string>()

export function isMultiSelected(id: string): boolean {
  return multiSelected.has(id)
}

export function multiSelectedIds(): string[] {
  return [...multiSelected]
}

// Cmd/Ctrl+click on a terminal row: add or remove it from the marked set.
export function toggleMultiSelect(id: string): void {
  if (multiSelected.has(id)) multiSelected.delete(id)
  else multiSelected.add(id)
}

export function clearMultiSelect(): void {
  multiSelected.clear()
}

// Show the marked terminals tiled in the content area. A VIEW: the terminals stay
// where they are in the sidebar and in their tabs.
export function showSideBySide(tabIds: string[]): void {
  setSideBySide(tabIds)
  renderContent()
  requestSidebar()
}

export function clearSideBySideSelection(): void {
  clearMultiSelect()
  exitSideBySide()
  renderContent()
  requestSidebar()
}
