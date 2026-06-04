import type { ITheme } from '@xterm/xterm'
import type { Pane, BrowserPane, DocPane, SqlPane, DiffPane, FilePane, SidebarNode, FolderNode, ProjectNode, Application, Feature, Font, SidebarPrefs, SshConnection, PaletteCommand, AppNotification, Reminder, ReminderDefaults, TimeEntry, DbNode, ActionMenuItem, Bookmark, DailyPlanData, DailyPlanTask, DailyPlanTag, MeetingNote, AccountEntry } from './types'
import { BUILTIN_ACTIONS } from './types'
import { themes, defaultThemeName, withSelection, SELECTION_BACKGROUND, SELECTION_FOREGROUND } from './themes'
import { PALETTE_SEED } from './palette-seed'
import { allTabs } from './tree'
import type { SavedState, SavedSidebarNode, SavedNode } from '../../preload/api'

// ---- Live state (mutated in place; modules import these singletons) ----

export const panes = new Map<string, Pane>()
export const browsers = new Map<string, BrowserPane>()
export const docs = new Map<string, DocPane>() // markdown note panes
export const sqlPanes = new Map<string, SqlPane>() // SQL editor panes (db tool)
export const diffPanes = new Map<string, DiffPane>() // PR diff panes (transient)
export const filePanes = new Map<string, FilePane>() // file viewer panes (transient)
export const opened = new Set<string>()
// Pane ids currently shown in a separate pop-out window (rendered as a
// placeholder in the main layout; runtime only, never persisted).
export const poppedOut = new Set<string>()

// Right notification panel: live cards. The last 24h of cards are persisted to
// disk (capped at 50) so the panel survives a restart with recent context
// intact; older entries are pruned on save and on load.
export const notifications: AppNotification[] = []
export const NOTIF_PERSIST_WINDOW_MS = 24 * 60 * 60 * 1000
export const NOTIF_PERSIST_CAP = 50
export const notifState = { open: true } // shown by default; toggle hides it

// App-tracked command history (commands typed in the app's terminals).
export const commandHistory: string[] = []
export function recordCommand(cmd: string): void {
  const c = cmd.trim()
  if (!c || c.length > 500) return
  if (commandHistory[commandHistory.length - 1] === c) return // skip immediate repeats
  commandHistory.push(c)
  if (commandHistory.length > 1000) commandHistory.splice(0, commandHistory.length - 1000)
  saveSoon()
}

export const state = {
  tree: [] as SidebarNode[],
  activeTabId: null as string | null,
  activePaneId: null as string | null,
  // Last node clicked in the sidebar — context for "new terminal in this group".
  selectedNodeId: null as string | null
}

// Default quick-time chips for the reminder form; user-editable in Settings.
export const DEFAULT_REMINDER_PRESETS: ReminderDefaults['presets'] = [
  { label: '+15m', offsetMin: 15 },
  { label: '+30m', offsetMin: 30 },
  { label: '+1h', offsetMin: 60 },
  { label: '+2h', offsetMin: 120 },
  { label: '+3h', offsetMin: 180 },
  { label: '+5h', offsetMin: 300 },
  { label: 'Tomorrow', days: 1, snapHour: true },
  { label: '+2 days', days: 2 },
  { label: '+3 days', days: 3 },
  { label: '+4 days', days: 4 }
]

export const settings = {
  themeName: defaultThemeName,
  customTheme: {
    ...(themes[defaultThemeName] as unknown as Record<string, string>),
    selectionBackground: SELECTION_BACKGROUND,
    selectionForeground: SELECTION_FOREGROUND
  } as Record<string, string>,
  font: { family: 'Menlo, Monaco, "Courier New", monospace', size: 13 } as Font,
  bgColor: '#000000', // terminal/app background; user-selectable, defaults to black
  docFontSize: 15, // markdown (notebook) doc font size; Cmd+/- when a doc is focused
  codeRoot: '', // base folder for the Cmd+P folder picker ('' = home)
  todoFile: '', // path to todo-list.md for the Improve Crafterm panel
  repoPath: '', // Crafterm source repo path used by the "Update Crafterm" action
  updateCommand: 'run-crafterm-deploy', // shell command run in repoPath to rebuild the app
  // file extensions that open with `ide <path>` when clicked in the terminal
  codeExtensions: [
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'swift', 'py', 'go', 'rs', 'java',
    'rb', 'c', 'cpp', 'h', 'hpp', 'json', 'css', 'scss', 'html', 'vue', 'php', 'sh'
  ] as string[],
  // user-editable shell commands + the folders shown as Cmd+O finder filter chips
  commands: { ide: 'ide', openMyZsh: 'openmyzsh', mdFolders: [] as string[] },
  environments: ['dev', 'local', 'production'] as string[], // global environment names
  groups: [] as string[], // user-managed workspace group labels (chip dropdown in Projects)
  actionMenu: [] as ActionMenuItem[], // sidebar ⋯ menu rows (seeded from builtins on first run)
  sshConnections: [] as SshConnection[], // saved ssh hosts (action menu → My SSH connections)
  // user-managed command palette entries (predefined + git/linux cheatsheets);
  // seeded on first run, edited in Settings → Command palette
  paletteCommands: PALETTE_SEED.map((c) => ({ ...c })) as PaletteCommand[],
  notifPanelSize: 290, // right notification panel width (px), resizable
  notifSound: 'Glass', // macOS system sound played on notification ('' = off)
  reminders: [] as Reminder[], // scheduled reminders (right panel → Reminders tab)
  // Default hour + quick-time chips for the reminder form (Settings → Reminders).
  reminderDefaults: { defaultHour: 11, presets: DEFAULT_REMINDER_PRESETS.map((p) => ({ ...p })) } as ReminderDefaults,
  bookmarks: [] as Bookmark[], // saved bookmarks (right panel → Bookmarks tab)
  accounts: [] as AccountEntry[], // sidebar Accounts mode: credential ledger + secrets
  // Per-period token caps used to compute the % chip in the top status bar.
  // Defaults sized for a Max-tier subscription; user can adjust in Settings.
  claudePlanCaps: {
    daily: 7_000_000,
    weekly: 50_000_000,
    monthly: 200_000_000,
    effort: 'medium' as 'low' | 'medium' | 'high'
  },
  // OAuth token source for the real `/api/oauth/usage` percentages: the macOS
  // keychain service Claude Code stores its credential under, plus a fallback
  // Crafterm secret (entryId + field key) read when the keychain is empty.
  claudeUsageAuth: {
    keychainService: 'Claude Code-credentials',
    fallbackSecretId: '',
    fallbackSecretKey: ''
  },
  // Highest usage threshold already notified per window, per reset period, so a
  // 50/70/80/90/100% crossing alerts once until the window resets.
  claudeUsageNotify: {
    session: { resetsAt: 0, level: 0 },
    week: { resetsAt: 0, level: 0 }
  },
  explorerRoot: '', // file explorer root ('' = active terminal cwd)
  explorerExclude: ['node_modules', '.git', '.DS_Store', 'dist', 'out'] as string[],
  // external files linked into the notebook tree (shown under "Linked files")
  linkedFiles: [] as { path: string; name: string }[],
  notebookColors: {} as Record<string, string>, // notebook node path -> color tag
  dbTree: [] as DbNode[], // Database tool: project/folder/connection tree
  timeEntries: [] as TimeEntry[], // logged work intervals
  dailyPlan: { tasks: [], tags: [] } as DailyPlanData, // Kanban-style daily task tracker
  meetingNotes: [] as MeetingNote[], // structured meeting notes (Notebook → Meeting Notes)
  askProjectOnNew: true, // ask which project to open on a new terminal
  // Sidebar + right-panel tab strips: icon-only / text-only / both, plus per-tab
  // hide lists keyed by strip. Configured in Settings → Tabs.
  tabDisplay: {
    mode: 'icon' as 'icon' | 'text' | 'both',
    hidden: { left: [] as string[], right: [] as string[] }
  },
  bindings: {} as Record<string, string>, // keybinding overrides (action id -> combo)
  sidebar: {
    size: 230,
    orientation: 'left',
    fontSize: 13,
    collapsed: false,
    details: { status: true, git: true, panes: true, paneList: false },
    groupByRecency: false
  } as SidebarPrefs
}

let seq = 0
export function uid(prefix: string): string {
  return prefix + ++seq
}

export function resolveTheme(): ITheme {
  const base =
    settings.themeName === 'Custom'
      ? (settings.customTheme as ITheme)
      : withSelection(themes[settings.themeName] ?? themes[defaultThemeName])
  // user-chosen background always wins (defaults to black)
  return { ...base, background: settings.bgColor }
}

// Apply the chosen background to the app chrome (terminals get it via the theme).
export function applyBgColor(): void {
  document.documentElement.style.setProperty('--bg', settings.bgColor)
  document.documentElement.style.setProperty('--bg-term', settings.bgColor)
}

// Markdown doc panes read their size from this CSS variable.
export function applyDocFont(): void {
  document.documentElement.style.setProperty('--doc-font', settings.docFontSize + 'px')
}

// ---- Render orchestration (main.ts wires the real implementations) ----

export const hooks = {
  renderSidebar: () => {}, // full structural rebuild
  updateStatuses: () => {}, // light: status dots + detail text
  updateActive: () => {}, // light: active-tab highlight only
  updatePaneHighlight: () => {}, // light: active-pane border only
  renderContent: () => {},
  renderNotifications: () => {} // right notification panel
}

// Add a card to the right notification panel (newest first). `meta` carries the
// optional folder/git/cwd detail and reminder context shown on the card.
export function pushNotification(
  paneId: string,
  title: string,
  group: string,
  message: string,
  meta: import('./types').NotificationMeta = {}
): void {
  notifications.unshift({ id: uid('n'), paneId, title, group, message, time: Date.now(), ...meta })
  if (notifications.length > 100) notifications.length = 100
  hooks.renderNotifications()
}

export function updateActive(): void {
  hooks.updateActive()
}

export function updatePaneActive(): void {
  hooks.updatePaneHighlight()
}

// Pane UI -> command dispatch (wired in main.ts to avoid import cycles).
export const paneActions = {
  select: (_id: string) => {},
  close: (_id: string) => {},
  openLink: (_url: string) => {},
  createWorktree: (_paneId: string) => {},
  split: (_paneId: string, _dir: 'row' | 'col') => {},
  movePane: (_dragId: string, _targetId: string, _zone: string) => {},
  popOut: (_paneId: string) => {},
  git: (_paneId: string, _action: 'pull' | 'commitPush' | 'commitPushPr' | 'stash' | 'branchPr') => {},
  stashes: (_paneId: string) => {},
  branchCheckout: (_paneId: string) => {},
  splitWithProject: (_paneId: string) => {},
  openUrl: () => {},
  trackTime: (_paneId: string) => {},
  runApp: (_project: ProjectNode, _app: Application) => {},
  openPlanInGroup: (_originPaneId: string, _absPath: string) => {},
  clarify: (_paneId: string) => {},
  // Daily-task assignment (todo50). Wired in main.ts to dailyPlan.ts so pane.ts
  // can drive them without importing dailyPlan directly (avoids an import cycle).
  assignDailyTask: (_paneId: string) => {},
  dailyTaskLabel: (_taskId: string): string | null => null
}

let sbPending = false
let stPending = false
export function requestSidebar(): void {
  if (sbPending) return
  sbPending = true
  requestAnimationFrame(() => {
    sbPending = false
    hooks.renderSidebar()
  })
}
export function requestStatuses(): void {
  if (stPending) return
  stPending = true
  requestAnimationFrame(() => {
    stPending = false
    hooks.updateStatuses()
  })
}
export function renderContent(): void {
  hooks.renderContent()
}

// ---- Persistence ----

let saveTimer: number | null = null

// Save status: drives the "Saving… / Saved HH:MM:SS" chip in the settings modal.
export const saveStatus = {
  pending: false,
  lastSavedAt: 0
}
const saveStatusListeners = new Set<() => void>()
export function subscribeSaveStatus(cb: () => void): () => void {
  saveStatusListeners.add(cb)
  return () => saveStatusListeners.delete(cb)
}
function emitSaveStatus(): void {
  saveStatusListeners.forEach((cb) => cb())
}

export function saveSoon(): void {
  if (saveTimer) clearTimeout(saveTimer)
  if (!saveStatus.pending) {
    saveStatus.pending = true
    emitSaveStatus()
  }
  saveTimer = window.setTimeout(persist, 300)
}

// Persist immediately (e.g. on app quit), cancelling any pending debounced save.
export function persistNow(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  persist()
}

function serializeLayout(node: import('./types').LayoutNode): SavedNode {
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
    const p = panes.get(node.paneId)
    const leaf: SavedNode = { type: 'leaf' }
    if (p?.stableId) leaf.stableId = p.stableId // keep plan-file ownership across restarts
    if (p?.titleLocked) {
      leaf.title = p.title
      leaf.titleLocked = true
    }
    if (p?.cwd) leaf.cwd = p.cwd // restore in the same directory
    if (p?.claude) leaf.claude = true // resume the Claude session on restore
    if (p?.claudeSessionId) leaf.claudeSessionId = p.claudeSessionId // exact session for --resume
    if (p?.bgColor) leaf.bgColor = p.bgColor // per-pane background
    if (p?.projectId) leaf.projectId = p.projectId
    if (p?.appId) leaf.appId = p.appId
    if (p?.dailyTaskId) leaf.dailyTaskId = p.dailyTaskId
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

function serializeNode(node: SidebarNode): SavedSidebarNode {
  if (node.kind === 'tab') {
    return {
      kind: 'tab',
      title: node.title,
      titleLocked: node.titleLocked,
      color: node.color,
      pinned: node.pinned,
      root: serializeLayout(node.root),
      ...(node.detailsOpen ? { detailsOpen: true } : {})
    }
  }
  if (node.kind === 'project') {
    return {
      kind: 'project',
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
      ...(node.iosApp ? { iosApp: true } : {}),
      ...(node.iosConfig ? { iosConfig: node.iosConfig } : {}),
      ...(node.issueKeyPrefix ? { issueKeyPrefix: node.issueKeyPrefix } : {})
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
    ...(node.startup ? { startup: node.startup } : {}),
    ...(node.env ? { env: node.env } : {}),
    ...(node.shell ? { shell: node.shell } : {})
  }
}

function persist(): void {
  const data: SavedState = {
    tree: state.tree.map(serializeNode),
    theme: settings.themeName,
    customTheme: settings.customTheme,
    font: settings.font,
    bgColor: settings.bgColor,
    docFontSize: settings.docFontSize,
    codeRoot: settings.codeRoot,
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
  window.crafterm.saveState(data)
  saveStatus.pending = false
  saveStatus.lastSavedAt = Date.now()
  emitSaveStatus()
}

export function loadSettings(saved: SavedState): void {
  if (saved.font) settings.font = saved.font
  if (saved.sidebar) {
    settings.sidebar = {
      size: saved.sidebar.size ?? settings.sidebar.size,
      orientation: saved.sidebar.orientation ?? settings.sidebar.orientation,
      fontSize: saved.sidebar.fontSize ?? settings.sidebar.fontSize,
      collapsed: saved.sidebar.collapsed ?? settings.sidebar.collapsed,
      details: { ...settings.sidebar.details, ...(saved.sidebar.details ?? {}) },
      groupByRecency: saved.sidebar.groupByRecency ?? settings.sidebar.groupByRecency
    }
  }
  if (saved.customTheme) settings.customTheme = saved.customTheme
  if (saved.bgColor) settings.bgColor = saved.bgColor
  if (typeof saved.docFontSize === 'number') settings.docFontSize = saved.docFontSize
  if (typeof saved.codeRoot === 'string') settings.codeRoot = saved.codeRoot
  if (Array.isArray(saved.codeExtensions)) settings.codeExtensions = saved.codeExtensions
  if (typeof saved.todoFile === 'string') settings.todoFile = saved.todoFile
  if (typeof saved.repoPath === 'string') settings.repoPath = saved.repoPath
  if (typeof saved.updateCommand === 'string' && saved.updateCommand.trim()) {
    settings.updateCommand = saved.updateCommand
  }
  if (saved.commands) {
    settings.commands = {
      ide: saved.commands.ide ?? settings.commands.ide,
      openMyZsh: saved.commands.openMyZsh ?? settings.commands.openMyZsh,
      mdFolders: Array.isArray(saved.commands.mdFolders)
        ? saved.commands.mdFolders
        : settings.commands.mdFolders
    }
  }
  if (Array.isArray(saved.environments) && saved.environments.length)
    settings.environments = saved.environments
  if (Array.isArray(saved.groups)) settings.groups = saved.groups.filter((s) => typeof s === 'string')
  if (Array.isArray(saved.actionMenu) && saved.actionMenu.length) {
    settings.actionMenu = saved.actionMenu as ActionMenuItem[]
    // Auto-append any builtin actions added after this user's menu was seeded
    // (e.g. "Daily plan" shipped later). Items appear at the end of the menu;
    // saveSoon() persists the migration so it runs only once.
    let migrated = false
    const seenBuiltins = new Set(
      settings.actionMenu.filter((it) => it.kind === 'builtin').map((it) => it.builtinId)
    )
    for (const action of BUILTIN_ACTIONS) {
      if (seenBuiltins.has(action.id)) continue
      settings.actionMenu.push({
        id: uid('am'),
        title: action.label,
        kind: 'builtin',
        builtinId: action.id
      })
      migrated = true
    }
    if (migrated) saveSoon()
  } else {
    settings.actionMenu = seedActionMenu()
  }
  if (Array.isArray(saved.sshConnections)) settings.sshConnections = saved.sshConnections
  if (Array.isArray(saved.paletteCommands)) settings.paletteCommands = saved.paletteCommands
  if (typeof saved.notifPanelSize === 'number') settings.notifPanelSize = saved.notifPanelSize
  if (typeof saved.notifSound === 'string') settings.notifSound = saved.notifSound
  if (Array.isArray(saved.reminders)) settings.reminders = saved.reminders as Reminder[]
  if (saved.reminderDefaults && typeof saved.reminderDefaults === 'object') {
    const rd = saved.reminderDefaults
    const hour = Number(rd.defaultHour)
    settings.reminderDefaults = {
      defaultHour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : settings.reminderDefaults.defaultHour,
      presets: Array.isArray(rd.presets) && rd.presets.length
        ? rd.presets
            .filter((p) => p && typeof p.label === 'string')
            .map((p) => ({
              label: p.label,
              offsetMin: typeof p.offsetMin === 'number' ? p.offsetMin : undefined,
              days: typeof p.days === 'number' ? p.days : undefined,
              snapHour: p.snapHour === true ? true : undefined
            }))
        : settings.reminderDefaults.presets
    }
  }
  if (Array.isArray(saved.bookmarks)) settings.bookmarks = saved.bookmarks as Bookmark[]
  if (Array.isArray(saved.accounts)) settings.accounts = saved.accounts as AccountEntry[]
  if (saved.claudePlanCaps && typeof saved.claudePlanCaps === 'object') {
    settings.claudePlanCaps = {
      daily: Number(saved.claudePlanCaps.daily) || settings.claudePlanCaps.daily,
      weekly: Number(saved.claudePlanCaps.weekly) || settings.claudePlanCaps.weekly,
      monthly: Number(saved.claudePlanCaps.monthly) || settings.claudePlanCaps.monthly,
      effort:
        (saved.claudePlanCaps.effort as 'low' | 'medium' | 'high') ?? settings.claudePlanCaps.effort
    }
  }
  if (saved.claudeUsageAuth && typeof saved.claudeUsageAuth === 'object') {
    settings.claudeUsageAuth = {
      keychainService:
        typeof saved.claudeUsageAuth.keychainService === 'string'
          ? saved.claudeUsageAuth.keychainService
          : settings.claudeUsageAuth.keychainService,
      fallbackSecretId:
        typeof saved.claudeUsageAuth.fallbackSecretId === 'string'
          ? saved.claudeUsageAuth.fallbackSecretId
          : '',
      fallbackSecretKey:
        typeof saved.claudeUsageAuth.fallbackSecretKey === 'string'
          ? saved.claudeUsageAuth.fallbackSecretKey
          : ''
    }
  }
  if (saved.claudeUsageNotify && typeof saved.claudeUsageNotify === 'object') {
    const cn = saved.claudeUsageNotify
    const win = (
      v: unknown,
      fb: { resetsAt: number; level: number }
    ): { resetsAt: number; level: number } => {
      if (!v || typeof v !== 'object') return fb
      const o = v as Record<string, unknown>
      return { resetsAt: Number(o.resetsAt) || 0, level: Number(o.level) || 0 }
    }
    settings.claudeUsageNotify = {
      session: win(cn.session, settings.claudeUsageNotify.session),
      week: win(cn.week, settings.claudeUsageNotify.week)
    }
  }
  if (typeof saved.explorerRoot === 'string') settings.explorerRoot = saved.explorerRoot
  if (Array.isArray(saved.explorerExclude)) settings.explorerExclude = saved.explorerExclude
  if (Array.isArray(saved.linkedFiles)) settings.linkedFiles = saved.linkedFiles
  if (saved.notebookColors && typeof saved.notebookColors === 'object')
    settings.notebookColors = saved.notebookColors
  if (Array.isArray(saved.dbTree)) settings.dbTree = saved.dbTree as DbNode[]
  if (Array.isArray(saved.timeEntries)) settings.timeEntries = saved.timeEntries
  if (saved.dailyPlan && typeof saved.dailyPlan === 'object') {
    const dp = saved.dailyPlan
    settings.dailyPlan = {
      tasks: Array.isArray(dp.tasks) ? (dp.tasks as DailyPlanTask[]) : [],
      tags: Array.isArray(dp.tags) ? (dp.tags as DailyPlanTag[]) : []
    }
  }
  if (Array.isArray(saved.meetingNotes)) settings.meetingNotes = saved.meetingNotes as MeetingNote[]
  if (typeof saved.askProjectOnNew === 'boolean') settings.askProjectOnNew = saved.askProjectOnNew
  if (saved.tabDisplay && typeof saved.tabDisplay === 'object') {
    const td = saved.tabDisplay
    const mode = td.mode === 'text' || td.mode === 'both' ? td.mode : 'icon'
    const strArr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []
    settings.tabDisplay = {
      mode,
      hidden: {
        left: strArr(td.hidden?.left),
        right: strArr(td.hidden?.right)
      }
    }
  }
  if (saved.bindings) settings.bindings = saved.bindings
  if (Array.isArray(saved.commandHistory)) commandHistory.push(...saved.commandHistory)
  if (saved.theme && (themes[saved.theme] || saved.theme === 'Custom')) settings.themeName = saved.theme
  if (Array.isArray(saved.notifications)) {
    const cutoff = Date.now() - NOTIF_PERSIST_WINDOW_MS
    for (const n of saved.notifications) {
      if (typeof n?.time !== 'number' || n.time < cutoff) continue
      notifications.push(n as AppNotification)
      if (notifications.length >= NOTIF_PERSIST_CAP) break
    }
  }
}

export function activeTabsCount(): number {
  return allTabs(state.tree).length
}

// Default action-menu rows: one builtin entry per registered action, in the
// historical order. Used on first run and when no saved menu exists.
export function seedActionMenu(): ActionMenuItem[] {
  return BUILTIN_ACTIONS.map((a) => ({
    id: uid('am'),
    title: a.label,
    kind: 'builtin' as const,
    builtinId: a.id
  }))
}

// One-time migration of pre-unified-tree state. settings.projects and
// settings.features no longer exist at runtime; older state files still have
// them, so we fold those entries into state.tree once after restore. The next
// persist() drops the legacy fields from the JSON.
export function migrateLegacyState(saved: SavedState): void {
  if (Array.isArray(saved.projects) && saved.projects.length) {
    mergeLegacyProjects(state.tree, saved.projects)
  }
  if (Array.isArray(saved.features) && saved.features.length) {
    for (const f of saved.features) {
      const owner = findProjectByPathInTree(state.tree, f.projectPath)
      if (!owner) continue
      owner.features = owner.features ?? []
      if (!owner.features.find((x) => x.id === f.id)) {
        owner.features.push({ id: f.id, name: f.name })
      }
    }
  }
}

// Merge a legacy catalog (Project[]) into the live sidebar tree at the given
// level. Path-based dedup: an existing ProjectNode at the same path gets the
// catalog's missing fields filled in (apps, startup, env, shell, command, group)
// and its sub-projects merged recursively. Catalog projects with no match are
// pushed as new ProjectNodes.
function mergeLegacyProjects(
  list: SidebarNode[],
  catalog: import('./types').Project[]
): void {
  for (const c of catalog) {
    let node = list.find((n): n is ProjectNode => n.kind === 'project' && n.path === c.path)
    if (!node) {
      node = {
        kind: 'project',
        id: uid('p'),
        name: c.name,
        color: null,
        collapsed: false,
        pinned: false,
        children: [],
        path: c.path
      }
      list.push(node)
    }
    if (c.command && !node.command) node.command = c.command
    if (c.group && !node.group) node.group = c.group
    if (c.startup && !node.startup) node.startup = c.startup
    if (c.env && !node.env) node.env = c.env
    if (c.shell && !node.shell) node.shell = c.shell
    if (c.apps && c.apps.length) {
      const existing = node.apps ?? []
      const byId = new Set(existing.map((a) => a.id))
      for (const a of c.apps) if (!byId.has(a.id)) existing.push(a)
      node.apps = existing
    }
    if (c.children && c.children.length) mergeLegacyProjects(node.children, c.children)
  }
}

function findProjectByPathInTree(nodes: SidebarNode[], path: string): ProjectNode | null {
  for (const n of nodes) {
    if (n.kind === 'project' && n.path === path) return n
    if (n.kind === 'project' || n.kind === 'folder') {
      const r = findProjectByPathInTree(n.children, path)
      if (r) return r
    }
  }
  return null
}
