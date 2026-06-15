import type { LayoutNode, NodeStatus, SidebarNode, AppNotification } from '../../types'
import type { SavedState, SavedSidebarNode, SavedNode } from '../../../../preload/api'
import { panesInLayout } from '../../tree'
import {
  panes,
  sqlPanes,
  codePanes,
  state,
  settings,
  notifications,
  commandHistory,
  NOTIF_PERSIST_WINDOW_MS,
  NOTIF_PERSIST_CAP
} from '../../state'
import { storeService } from '../ipc'

// Renderer persistence/data layer. Owns the debounced save, the serialize
// pipeline (live singletons -> SavedState), and the save-status chip feed.
// `state.ts` keeps only the live singletons; nothing here is imported by it at
// module-init time, so there is no cycle.

let saveTimer: number | null = null

const saveStatus = {
  pending: false,
  lastSavedAt: 0
}
const saveStatusListeners = new Set<() => void>()
function emitSaveStatus(): void {
  saveStatusListeners.forEach((cb) => cb())
}

export function serializeLayout(node: LayoutNode): SavedNode {
  if (node.type === 'leaf') {
    const sp = sqlPanes.get(node.paneId)
    if (sp) {
      return {
        type: 'leaf',
        sqlPane: {
          connId: sp.connId,
          code: sp.getCode(),
          fileName: sp.fileName,
          themeName: sp.themeName
        }
      }
    }
    const cp = codePanes.get(node.paneId)
    if (cp) {
      return { type: 'leaf', codePane: { path: cp.path, themeName: cp.themeName } }
    }
    const p = panes.get(node.paneId)
    const leaf: SavedNode = { type: 'leaf' }
    if (p?.stableId) leaf.stableId = p.stableId // keep plan-file ownership across restarts
    if (p?.titleLocked) {
      leaf.title = p.title
      leaf.titleLocked = true
    }
    if (p?.cwd) leaf.cwd = p.cwd // restore in the same directory
    // Pre-type the last command on restore for raw terminals. Skipped for Claude
    // panes — they resume via `claude --resume`, not by re-typing the command.
    if (p?.lastCommand && !p.claude) leaf.lastCommand = p.lastCommand
    if (p?.claude) leaf.claude = true // resume the Claude session on restore
    if (p?.claudeSessionId) leaf.claudeSessionId = p.claudeSessionId // exact session for --resume
    if (p?.bgColor) leaf.bgColor = p.bgColor // per-pane background
    if (p?.projectId) leaf.projectId = p.projectId
    if (p?.appId) leaf.appId = p.appId
    if (p?.status) leaf.status = p.status
    if (p?.role) leaf.role = p.role
    // Persisted as the multi-valued tickets[]; the single in-memory dailyTaskId
    // is the current source until the multi-ticket UI (todo14).
    if (p?.dailyTaskId) leaf.tickets = [p.dailyTaskId]
    return leaf
  }
  return {
    type: 'split',
    dir: node.dir,
    sizes: node.sizes.slice(),
    children: node.children.map(serializeLayout)
  }
}

// Strip notifications down to the most recent, in-window entries so a restart
// restores the panel without bloating the on-disk JSON.
function serializeNotifications(): AppNotification[] {
  const cutoff = Date.now() - NOTIF_PERSIST_WINDOW_MS
  return notifications.filter((n) => n.time >= cutoff).slice(0, NOTIF_PERSIST_CAP)
}

// A tab's status is derived from its panes: waiting > running > (all archived →
// archived) > idle. Mirrors the unified data model (a container reflects its
// children's lifecycle).
function deriveTabStatus(root: LayoutNode): NodeStatus {
  const statuses = panesInLayout(root)
    .map((id) => panes.get(id)?.status)
    .filter((s): s is NodeStatus => !!s)
  if (!statuses.length) return 'idle'
  if (statuses.includes('waiting')) return 'waiting'
  if (statuses.includes('running')) return 'running'
  if (statuses.every((s) => s === 'archived')) return 'archived'
  return 'idle'
}

function serializeNode(node: SidebarNode): SavedSidebarNode {
  if (node.kind === 'tab') {
    return {
      kind: 'tab',
      title: node.title,
      titleLocked: node.titleLocked,
      color: node.color,
      pinned: node.pinned,
      // Archived sessions keep their preserved layout (dormantRoot) so they stay
      // reactivatable; the live root is just an empty placeholder while dormant.
      root: node.status === 'archived' && node.dormantRoot ? node.dormantRoot : serializeLayout(node.root),
      status: node.status ?? deriveTabStatus(node.root),
      ...(node.detailsOpen ? { detailsOpen: true } : {})
    }
  }
  if (node.kind === 'project') {
    return {
      kind: 'project',
      id: node.id,
      name: node.name,
      color: node.color,
      collapsed: node.collapsed,
      pinned: node.pinned,
      children: node.children.map(serializeNode),
      path: node.path,
      ...(node.command ? { command: node.command } : {}),
      ...(node.group ? { group: node.group } : {}),
      ...(node.startup ? { startup: node.startup } : {}),
      ...(node.env ? { env: node.env } : {}),
      ...(node.shell ? { shell: node.shell } : {}),
      ...(node.apps && node.apps.length ? { apps: node.apps } : {}),
      ...(node.features && node.features.length ? { features: node.features } : {}),
      ...(node.runCommands && node.runCommands.length ? { runCommands: node.runCommands } : {}),
      ...(node.supportWorktree ? { supportWorktree: true } : {}),
      ...(node.iosApp ? { iosApp: true } : {}),
      ...(node.iosConfig ? { iosConfig: node.iosConfig } : {}),
      ...(node.issueKeyPrefix ? { issueKeyPrefix: node.issueKeyPrefix } : {})
    }
  }
  if (node.kind === 'worktree') {
    return {
      kind: 'worktree',
      name: node.name,
      color: node.color,
      collapsed: node.collapsed,
      pinned: node.pinned,
      children: node.children.map(serializeNode),
      branch: node.branch,
      worktreePath: node.worktreePath,
      status: node.status ?? 'idle',
      ...(node.group ? { group: node.group } : {}),
      ...(node.lastRun ? { lastRun: node.lastRun } : {}),
      ...(node.processes && node.processes.length ? { processes: node.processes } : {}),
      ...(node.startup ? { startup: node.startup } : {}),
      ...(node.env ? { env: node.env } : {}),
      ...(node.shell ? { shell: node.shell } : {})
    }
  }
  return {
    kind: 'folder',
    name: node.name,
    color: node.color,
    collapsed: node.collapsed,
    pinned: node.pinned,
    children: node.children.map(serializeNode),
    ...(node.group ? { group: node.group } : {}),
    ...(node.feature ? { feature: node.feature } : {}),
    ...(node.worktreeContainer ? { worktreeContainer: true } : {}),
    ...(node.worktreePath ? { worktreePath: node.worktreePath } : {}),
    ...(node.startup ? { startup: node.startup } : {}),
    ...(node.env ? { env: node.env } : {}),
    ...(node.shell ? { shell: node.shell } : {})
  }
}

// Bumped when the persisted shape changes. Main backs up the state file once
// before loading any state whose schemaVersion is below this (migrate-on-load).
const SCHEMA_VERSION = 4

function persist(): void {
  const data: SavedState = {
    schemaVersion: SCHEMA_VERSION,
    tree: state.tree.map(serializeNode),
    theme: settings.themeName,
    customTheme: settings.customTheme,
    font: settings.font,
    bgColor: settings.bgColor,
    editorTheme: settings.editorTheme,
    docFontSize: settings.docFontSize,
    codeRoot: settings.codeRoot,
    prProjects: settings.prProjects,
    codeExtensions: settings.codeExtensions,
    todoFile: settings.todoFile,
    repoPath: settings.repoPath,
    updateCommand: settings.updateCommand,
    commands: settings.commands,
    environments: settings.environments,
    groups: settings.groups,
    actionMenu: settings.actionMenu,
    sshConnections: settings.sshConnections,
    paletteCommands: settings.paletteCommands,
    notifPanelSize: settings.notifPanelSize,
    notifSound: settings.notifSound,
    reminders: settings.reminders,
    reminderDefaults: settings.reminderDefaults,
    bookmarks: settings.bookmarks,
    accounts: settings.accounts,
    claudePlanCaps: settings.claudePlanCaps,
    claudeUsageAuth: settings.claudeUsageAuth,
    claudeUsageNotify: settings.claudeUsageNotify,
    explorerRoot: settings.explorerRoot,
    explorerExclude: settings.explorerExclude,
    linkedFiles: settings.linkedFiles,
    notebookColors: settings.notebookColors,
    dbTree: settings.dbTree,
    timeEntries: settings.timeEntries,
    dailyPlan: settings.dailyPlan,
    meetingNotes: settings.meetingNotes,
    askProjectOnNew: settings.askProjectOnNew,
    tabDisplay: settings.tabDisplay,
    bindings: settings.bindings,
    commandHistory,
    sidebar: settings.sidebar,
    notifications: serializeNotifications()
  }
  storeService.save(data)
  saveStatus.pending = false
  saveStatus.lastSavedAt = Date.now()
  emitSaveStatus()
}

export const persistence = {
  // Debounced save (300ms). Coalesces bursts of mutations into one write.
  save(): void {
    if (saveTimer) clearTimeout(saveTimer)
    if (!saveStatus.pending) {
      saveStatus.pending = true
      emitSaveStatus()
    }
    saveTimer = window.setTimeout(persist, 300)
  },
  // Persist immediately (e.g. on app quit), cancelling any pending debounced save.
  flush(): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    persist()
  },
  serializeLayout,
  // Save-status feed for the "Saving… / Saved HH:MM:SS" chip in Settings.
  status: saveStatus,
  subscribe(cb: () => void): () => void {
    saveStatusListeners.add(cb)
    return () => saveStatusListeners.delete(cb)
  }
}

// App-tracked command history (commands typed in the app's terminals).
export function recordCommand(cmd: string): void {
  const c = cmd.trim()
  if (!c || c.length > 500) return
  if (commandHistory[commandHistory.length - 1] === c) return // skip immediate repeats
  commandHistory.push(c)
  if (commandHistory.length > 1000) commandHistory.splice(0, commandHistory.length - 1000)
  persistence.save()
}
