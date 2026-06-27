import type { ITheme } from '@xterm/xterm'
import type { Pane, BrowserPane, DocPane, SqlPane, DiffPane, FilePane, CodePane, SidebarNode, FolderNode, ProjectNode, Application, Feature, Font, SidebarPrefs, SshConnection, PaletteCommand, AppNotification, Reminder, ReminderDefaults, TimeEntry, DbNode, ActionMenuItem, Bookmark, DailyPlanData, DailyPlanTask, DailyPlanTag, MeetingNote, AccountEntry } from '@ui/types/types'
import { themes, defaultThemeName, withSelection, SELECTION_BACKGROUND, SELECTION_FOREGROUND } from '@ui/themes/themes'
import { PALETTE_SEED } from '@ui/palette-seed/palette-seed'
import { allTabs } from '@ui/tree/tree'
import { notificationRepo } from '@repositories/notification.repository'

// ---- Live state (mutated in place; modules import these singletons) ----

export const panes = new Map<string, Pane>()
export const browsers = new Map<string, BrowserPane>()
export const docs = new Map<string, DocPane>() // markdown note panes
export const sqlPanes = new Map<string, SqlPane>() // SQL editor panes (db tool)
export const diffPanes = new Map<string, DiffPane>() // PR diff panes (transient)
export const filePanes = new Map<string, FilePane>() // file viewer panes (transient)
export const codePanes = new Map<string, CodePane>() // editable code editor panes
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
  editorTheme: 'Default', // global Monaco theme name for the code + SQL editors
  docFontSize: 15, // markdown (notebook) doc font size; Cmd+/- when a doc is focused
  codeRoot: '', // base folder for the Cmd+P folder picker ('' = home)
  defaultShell: '', // global default shell for spawned terminals/commands ('' = $SHELL, then /bin/zsh)
  prProjects: [] as string[], // repo paths shown in the PR panel's "All projects" view
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
  // Default hour + quick-time chips for the reminder form (Settings → Reminders).
  reminderDefaults: { defaultHour: 11, presets: DEFAULT_REMINDER_PRESETS.map((p) => ({ ...p })) } as ReminderDefaults,
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
  askProjectOnNew: true, // ask which project to open on a new terminal
  // Sidebar + right-panel tab strips: icon-only / text-only / both, plus per-tab
  // hide lists keyed by strip. Configured in Settings → Tabs.
  tabDisplay: {
    mode: 'icon' as 'icon' | 'text' | 'both',
    hidden: { left: [] as string[], right: [] as string[] },
    // Per-strip tab order (button ids). Empty -> natural TAB_META order.
    order: { left: [] as string[], right: [] as string[] }
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
  // `seq` alone restarts at 0 each session while ids persist, so a fresh session
  // would regenerate `tag1`, `task1`, … and collide with saved entities (a lookup
  // by id then returns the wrong, older one). Prefix the per-session time so ids
  // are unique across sessions; `++seq` keeps them unique within one.
  return `${prefix}${Date.now().toString(36)}${(++seq).toString(36)}`
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
  renderNotifications: () => {}, // right notification panel
  runShortcut: (_id: string) => {} // run an editable keybinding action by id (wired in main.ts)
}

// Add a card to the right notification panel (newest first). `meta` carries the
// optional folder/git/cwd detail and reminder context shown on the card.
export function pushNotification(
  paneId: string,
  title: string,
  group: string,
  message: string,
  meta: import('@ui/types/types').NotificationMeta = {}
): void {
  notificationRepo.add({ id: uid('n'), paneId, title, group, message, time: Date.now(), ...meta })
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
  dailyTaskLabel: (_taskId: string): string | null => null,
  dailyTaskIssueKey: (_taskId: string): string | null => null,
  dailyTaskStatus: (_taskId: string): string | null => null,
  viewTicketDetail: (_paneId: string) => {},
  markTaskDone: (_paneId: string) => {},
  markTaskReview: (_paneId: string) => {},
  markTaskTest: (_paneId: string) => {},
  // Reactivate an archived session: rebuild its dormant layout (panes + PTYs) and
  // clear the archived status. Wired in main.ts (needs buildLayout).
  reactivateTab: (_tabId: string) => {}
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

export function activeTabsCount(): number {
  return allTabs(state.tree).length
}
