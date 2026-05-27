import type { ITheme } from '@xterm/xterm'
import type { Pane, BrowserPane, DocPane, SqlPane, SidebarNode, FolderNode, ProjectNode, Application, Feature, Font, SidebarPrefs, SshConnection, PaletteCommand, AppNotification, Reminder, TimeEntry, DbNode } from './types'
import { themes, defaultThemeName, withSelection, SELECTION_BACKGROUND, SELECTION_FOREGROUND } from './themes'
import { PALETTE_SEED } from './palette-seed'
import { allTabs } from './tree'
import type { SavedState, SavedSidebarNode, SavedNode } from '../../preload/api'

// ---- Live state (mutated in place; modules import these singletons) ----

export const panes = new Map<string, Pane>()
export const browsers = new Map<string, BrowserPane>()
export const docs = new Map<string, DocPane>() // markdown note panes
export const sqlPanes = new Map<string, SqlPane>() // SQL editor panes (db tool)
export const opened = new Set<string>()
// Pane ids currently shown in a separate pop-out window (rendered as a
// placeholder in the main layout; runtime only, never persisted).
export const poppedOut = new Set<string>()

// Right notification panel: live cards (session-only, never persisted).
export const notifications: AppNotification[] = []
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
  sshConnections: [] as SshConnection[], // saved ssh hosts (action menu → My SSH connections)
  // user-managed command palette entries (predefined + git/linux cheatsheets);
  // seeded on first run, edited in Settings → Command palette
  paletteCommands: PALETTE_SEED.map((c) => ({ ...c })) as PaletteCommand[],
  notifPanelSize: 290, // right notification panel width (px), resizable
  notifSound: 'Glass', // macOS system sound played on notification ('' = off)
  reminders: [] as Reminder[], // scheduled reminders (right panel → Reminders tab)
  explorerRoot: '', // file explorer root ('' = active terminal cwd)
  explorerExclude: ['node_modules', '.git', '.DS_Store', 'dist', 'out'] as string[],
  // external files linked into the notebook tree (shown under "Linked files")
  linkedFiles: [] as { path: string; name: string }[],
  notebookColors: {} as Record<string, string>, // notebook node path -> color tag
  dbTree: [] as DbNode[], // Database tool: project/folder/connection tree
  timeEntries: [] as TimeEntry[], // logged work intervals
  askProjectOnNew: true, // ask which project to open on a new terminal
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
  trackTime: (_paneId: string) => {}
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
export function saveSoon(): void {
  if (saveTimer) clearTimeout(saveTimer)
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
    return leaf
  }
  return {
    type: 'split',
    dir: node.dir,
    sizes: node.sizes.slice(),
    children: node.children.map(serializeLayout)
  }
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
      ...(node.features && node.features.length ? { features: node.features } : {})
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
    sshConnections: settings.sshConnections,
    paletteCommands: settings.paletteCommands,
    notifPanelSize: settings.notifPanelSize,
    notifSound: settings.notifSound,
    reminders: settings.reminders,
    explorerRoot: settings.explorerRoot,
    explorerExclude: settings.explorerExclude,
    linkedFiles: settings.linkedFiles,
    notebookColors: settings.notebookColors,
    dbTree: settings.dbTree,
    timeEntries: settings.timeEntries,
    askProjectOnNew: settings.askProjectOnNew,
    bindings: settings.bindings,
    commandHistory,
    sidebar: settings.sidebar
  }
  window.crafterm.saveState(data)
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
  if (Array.isArray(saved.sshConnections)) settings.sshConnections = saved.sshConnections
  if (Array.isArray(saved.paletteCommands)) settings.paletteCommands = saved.paletteCommands
  if (typeof saved.notifPanelSize === 'number') settings.notifPanelSize = saved.notifPanelSize
  if (typeof saved.notifSound === 'string') settings.notifSound = saved.notifSound
  if (Array.isArray(saved.reminders)) settings.reminders = saved.reminders
  if (typeof saved.explorerRoot === 'string') settings.explorerRoot = saved.explorerRoot
  if (Array.isArray(saved.explorerExclude)) settings.explorerExclude = saved.explorerExclude
  if (Array.isArray(saved.linkedFiles)) settings.linkedFiles = saved.linkedFiles
  if (saved.notebookColors && typeof saved.notebookColors === 'object')
    settings.notebookColors = saved.notebookColors
  if (Array.isArray(saved.dbTree)) settings.dbTree = saved.dbTree as DbNode[]
  if (Array.isArray(saved.timeEntries)) settings.timeEntries = saved.timeEntries
  if (typeof saved.askProjectOnNew === 'boolean') settings.askProjectOnNew = saved.askProjectOnNew
  if (saved.bindings) settings.bindings = saved.bindings
  if (Array.isArray(saved.commandHistory)) commandHistory.push(...saved.commandHistory)
  if (saved.theme && (themes[saved.theme] || saved.theme === 'Custom')) settings.themeName = saved.theme
}

export function activeTabsCount(): number {
  return allTabs(state.tree).length
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
