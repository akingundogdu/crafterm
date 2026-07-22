// ---- Unified node status / pane role (the stableId-keyed data model) ----
// Every persisted node carries a lifecycle status; panes additionally carry a
// role. Nodes are never deleted — closing/removal flips status to 'archived'.
export type NodeStatus = 'idle' | 'running' | 'waiting' | 'done' | 'archived'
export type PaneRole = 'claude' | 'app' | 'build' | 'shell'

// ---- Pane layout (split tree) ----
export interface SavedLeaf {
  type: 'leaf'
  // Stable per-pane identity that survives restarts (UUID v4). Generated on
  // first creation; reused on restore so plan-file ownership stays attached.
  stableId?: string
  title?: string // only persisted when the pane name was set manually
  titleLocked?: boolean
  cwd?: string // restore the terminal in its last working directory
  lastCommand?: string // last command run (raw panes only) — pre-typed on restore
  note?: string // per-pane markdown scratch note (the "Take a note" side panel)
  claude?: boolean // a Claude session — resumed on restore
  claudeSessionId?: string // exact session to `claude --resume <id>` on restore
  lastClaudeTitle?: string // last /rename title seen (a differing one may beat a locked title)
  bgColor?: string // per-pane background override
  // Project / application this terminal was spawned from (drives the pane
  // action menu's "Commands — …" sections after restore).
  projectId?: string
  appId?: string
  status?: NodeStatus // lifecycle status (idle/running/waiting/done/archived)
  role?: PaneRole // pane role (claude/app/build/shell)
  tickets?: string[] // daily-task ids this terminal is assigned to (multi)
  dailyTaskId?: string // deprecated single-ticket field; migrated into tickets[]
  // When set, this leaf is a SQL pane (not a terminal); restore creates a SqlPane.
  sqlPane?: {
    connId: string | null
    code: string
    fileName: string | null
    themeName?: string // CodeMirror theme name (defaults to "Default")
  }
  // When set, this leaf is an editable code editor pane; restore re-opens the
  // file from disk (unsaved edits are not persisted).
  codePane?: {
    path: string
    themeName?: string
  }
}
export interface SavedSplit {
  type: 'split'
  dir: 'row' | 'col'
  sizes: number[]
  children: SavedNode[]
}
export type SavedNode = SavedLeaf | SavedSplit

// ---- Sidebar tree (folders + terminal tabs) ----
export interface SavedTabNode {
  kind: 'tab'
  title: string
  titleLocked: boolean
  color: string | null
  pinned: boolean
  root: SavedNode
  detailsOpen?: boolean
  status?: NodeStatus // derived from child panes; 'archived' when closed
  archivedByWorktree?: boolean // archived by worktree-reconcile (not a user close)
}
export interface SavedFolder {
  kind: 'folder'
  name: string
  color: string | null
  collapsed: boolean
  pinned: boolean
  children: SavedSidebarNode[]
  group?: string
  feature?: string // worktree/feature folder marker (the branch name)
  worktreeContainer?: boolean // auto "worktrees" container under a project
  worktreePath?: string // this folder is a worktree at this absolute path
  startup?: string
  env?: string
  shell?: string
}
export interface SavedApplication {
  id: string
  name: string
  path?: string
  opensAs?: 'tab' | 'split'
  commands: Record<string, string>
  runCommands?: SavedProjectCommand[]
}
export interface SavedFeature {
  id: string
  name: string
}
export interface SavedProjectCommand {
  id: string
  name: string
  command: string
}
// Per-project iOS worktree config (repo root = the project's `path`). Empty
// fields are auto-detected by the bundled ios-worktree.sh script.
export interface SavedIosConfig {
  project?: string
  scheme?: string
  baseBundleId?: string
  displayPrefix?: string
  defaultSimulator?: string
  copyFiles?: string[]
  worktreesDir?: string
}
export interface SavedProject {
  kind: 'project'
  id?: string // stable primary key (persisted) — daily-task linkage keys on it
  name: string
  color: string | null
  collapsed: boolean
  pinned: boolean
  children: SavedSidebarNode[]
  path: string
  command?: string
  group?: string
  startup?: string
  env?: string
  shell?: string
  apps?: SavedApplication[]
  features?: SavedFeature[]
  runCommands?: SavedProjectCommand[]
  supportWorktree?: boolean
  iosApp?: boolean
  iosConfig?: SavedIosConfig
  issueKeyPrefix?: string
}
// A persisted background process (hidden shell) under a worktree.
export interface SavedBackgroundProcess {
  stableId: string
  title: string
  role: PaneRole
  status: NodeStatus
  command: string
  cwd: string
  target?: { kind: 'device' | 'simulator'; name: string; udid?: string }
}
// A git worktree as a first-class node (was SavedFolder + worktreePath marker).
export interface SavedWorktree {
  kind: 'worktree'
  name: string
  color: string | null
  collapsed: boolean
  pinned: boolean
  children: SavedSidebarNode[]
  group?: string
  branch: string
  worktreePath: string
  status?: NodeStatus
  processes?: SavedBackgroundProcess[]
  lastRun?: { kind: 'device' | 'simulator'; name: string; udid: string; scheme?: string }
  startup?: string
  env?: string
  shell?: string
}
export type SavedSidebarNode = SavedTabNode | SavedFolder | SavedProject | SavedWorktree

// ---- Legacy (pre-folders) tab list, kept for one-time migration ----
export interface SavedTab {
  title: string
  titleLocked: boolean
  root: SavedNode
}

// ---- Legacy catalog (pre-unified-tree): kept ONLY so old state files migrate ----
// settings.projects[] used to live alongside state.tree[]. On load, the values
// here are merged into the sidebar tree and the catalog field is dropped. This
// shape stays around until we know everyone has migrated.
export interface SavedCatalogProject {
  name: string
  path: string
  command?: string
  group?: string
  startup?: string
  env?: string
  shell?: string
  apps?: SavedApplication[]
  children?: SavedCatalogProject[]
}

export interface SavedFont {
  family: string
  size: number
}
export interface SavedSidebar {
  size: number
  orientation: 'left' | 'top'
  fontSize?: number
  collapsed?: boolean
  details: { status: boolean; git: boolean; panes: boolean; paneList?: boolean }
  groupByRecency?: boolean
}

// Database tool: persisted connection tree (passwords plaintext, user's choice).
export interface SavedDbConnection {
  id: string
  name: string
  engine: 'postgres' | 'mysql' | 'sqlite'
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  ssl?: boolean
  file?: string
}
export type SavedDbNode =
  | {
      kind: 'group'
      id: string
      name: string
      collapsed: boolean
      color?: string | null
      children: SavedDbNode[]
    }
  | { kind: 'conn'; id: string; collapsed: boolean; color?: string | null; conn: SavedDbConnection }

export interface SavedState {
  // Bumped when the persisted shape changes; main backs up the file once before
  // a mismatching (older) state is loaded and migrated. See store:load.
  schemaVersion?: number
  tree?: SavedSidebarNode[]
  tabs?: SavedTab[] // legacy
  theme: string // a built-in name, or 'Custom'
  customTheme?: Record<string, string>
  bgColor?: string // user-chosen background color
  sidebarSelectedColor?: string // border color of the selected sidebar node
  editorTheme?: string // global Monaco theme name for the code + SQL editors
  docFontSize?: number // markdown doc font size
  codeRoot?: string // base folder for the Cmd+P folder picker
  defaultShell?: string // global default shell for spawned terminals/commands
  prProjects?: string[] // repo paths shown in the PR panel's "All projects" view
  codeExtensions?: string[] // extensions that open via `ide` when clicked
  todoFile?: string // path to todo-list.md for the Improve Crafterm panel
  repoPath?: string // Crafterm source repo path for the "Update Crafterm" action
  updateCommand?: string // shell command run in repoPath to rebuild the app
  commands?: { ide?: string; openMyZsh?: string; mdFolders?: string[] } // commands + md filter folders
  projects?: SavedCatalogProject[] // legacy catalog; migrated into `tree` on load
  environments?: string[] // global environment names (dev/local/production)
  groups?: string[] // user-managed workspace group labels
  actionMenu?: {
    id: string
    title: string
    kind: 'builtin' | 'command'
    builtinId?: string
    command?: string
    opensAs?: 'split' | 'tab'
    hidden?: boolean
  }[]
  // saved ssh hosts (action menu → My SSH connections); password is plaintext
  sshConnections?: {
    id: string
    label: string
    host: string
    user?: string
    port?: number
    password?: string
  }[]
  // user-managed command palette entries (predefined + cheatsheets)
  paletteCommands?: { id: string; category: string; name: string; command: string }[]
  notifPanelSize?: number // right notification panel width (px)
  notifSound?: string // macOS system sound name played on notification
  reminders?: {
    id: string
    text: string
    time: number
    repeat: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'interval'
    intervalMin?: number
    enabled: boolean
    firedAt?: number
    payload?: { kind: string; [k: string]: unknown }
    category?: 'normal' | 'bookmark' | 'link' | 'dailyTask'
  }[]
  reminderDefaults?: {
    defaultHour?: number
    presets?: { label: string; offsetMin?: number; days?: number; snapHour?: boolean }[]
  }
  tabDisplay?: {
    mode?: 'icon' | 'text' | 'both'
    hidden?: { left?: string[]; right?: string[] }
    order?: { left?: string[]; right?: string[] }
  }
  bookmarks?: {
    id: string
    type: 'link' | 'text' | 'code' | 'snippet'
    title: string
    content: string
    tags: string[]
    language?: string
    createdAt: number
  }[]
  explorerRoot?: string // file explorer root path
  explorerExclude?: string[] // names hidden in the file explorer
  linkedFiles?: { path: string; name: string }[] // external files linked into the notebook
  notebookColors?: Record<string, string> // notebook node path -> color tag
  // legacy time-tracking features (had a projectPath); migrated onto the
  // matching ProjectNode.features[] on load.
  features?: { id: string; projectPath: string; name: string }[]
  timeEntries?: {
    id: string
    projectPath: string
    featureId?: string
    start: number
    end: number
    source: 'manual' | 'pomodoro' | 'auto'
  }[]
  dailyPlan?: {
    tasks: {
      id: string
      title: string
      description?: string
      date: string
      dueDate?: string
      status: 'backlog' | 'todo' | 'wip' | 'review' | 'test' | 'done'
      priority: 'low' | 'medium' | 'high'
      tagIds: string[]
      order: number
      projectId?: string
      issueKey?: string
      createdAt: number
      updatedAt: number
    }[]
    tags: { id: string; name: string; color: string }[]
  }
  meetingNotes?: {
    id: string
    title: string
    date: string
    attendees: string[]
    notes: string
    projectId?: string
    archived?: boolean
    createdAt: number
    updatedAt: number
  }[]
  askProjectOnNew?: boolean // ask which project to open on a new terminal
  bindings?: Record<string, string> // keybinding overrides
  commandHistory?: string[] // app-tracked command history
  font?: SavedFont
  sidebar?: SavedSidebar
  dbTree?: SavedDbNode[] // Database tool: project/folder/connection tree
  // User-defined Claude usage caps (tokens) — drive the % display in the top
  // status bar. Optional; sensible defaults are baked in.
  claudePlanCaps?: {
    daily: number
    weekly: number
    monthly: number
    effort?: 'low' | 'medium' | 'high' // user-noted effort label (display-only)
  }
  // Where to read the OAuth token for the real `/api/oauth/usage` endpoint:
  // a macOS keychain service name, with a fallback Crafterm secret (entryId +
  // field key) used when the keychain read returns nothing.
  claudeUsageAuth?: {
    keychainService: string
    fallbackSecretId: string
    fallbackSecretKey: string
  }
  // Threshold-notification bookkeeping so each 50/70/80/90/100% crossing fires
  // once per reset period. `level` is the highest threshold already notified;
  // it resets when `resetsAt` advances to a new window.
  claudeUsageNotify?: {
    session: { resetsAt: number; level: number }
    week: { resetsAt: number; level: number }
  }
  // Persisted notification cards from the last 24h (capped at 50). Restored on
  // launch so users don't lose context. Session-only entries beyond the cap or
  // older than 24h are pruned at save time.
  // Accounts & secrets — stored alongside the regular settings JSON. Secret
  // *values* are NEVER kept here; only the (entryId, fieldKey) tuple. The real
  // ciphertext lives under <stateDir>/secrets/<entryId>/<fieldKey>.bin via
  // Electron's safeStorage (Keychain-backed on macOS).
  accounts?: {
    id: string
    kind: 'account' | 'secret'
    service?: string
    label: string
    login?: string
    url?: string
    notes?: string
    tags?: string[]
    fields?: { key: string; value?: string; secret?: boolean }[]
    createdAt: number
    updatedAt: number
  }[]
  notifications?: {
    id: string
    paneId: string
    title: string
    group: string
    message: string
    time: number
    kind?: 'pane' | 'reminder'
    event?: 'question' | 'done'
    branch?: string | null
    worktree?: string | null
    cwd?: string | null
    reminderText?: string
    projectColor?: string
    paneStableId?: string
    payload?: { kind: string; [k: string]: unknown }
  }[]
}
