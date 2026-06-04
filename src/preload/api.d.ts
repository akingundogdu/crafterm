// ---- Pane layout (split tree) ----
export interface SavedLeaf {
  type: 'leaf'
  // Stable per-pane identity that survives restarts (UUID v4). Generated on
  // first creation; reused on restore so plan-file ownership stays attached.
  stableId?: string
  title?: string // only persisted when the pane name was set manually
  titleLocked?: boolean
  cwd?: string // restore the terminal in its last working directory
  claude?: boolean // a Claude session — resumed on restore
  claudeSessionId?: string // exact session to `claude --resume <id>` on restore
  bgColor?: string // per-pane background override
  // Project / application this terminal was spawned from (drives the pane
  // action menu's "Commands — …" sections after restore).
  projectId?: string
  appId?: string
  dailyTaskId?: string // daily-task this terminal is assigned to (todo50)
  // When set, this leaf is a SQL pane (not a terminal); restore creates a SqlPane.
  sqlPane?: {
    connId: string | null
    code: string
    fileName: string | null
    themeName?: string // CodeMirror theme name (defaults to "Default")
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
// Live status of one worktree's iOS variant (from `ios-worktree.sh report`).
export interface IosWorktreeStatus {
  path: string
  branch: string
  bundleId: string
  displayName: string
  built: boolean
  installed: boolean
  running: boolean
}
export interface IosWorktreeReport {
  simUdid: string
  baseBundleId: string
  scheme: string
  worktrees: IosWorktreeStatus[]
}
export interface SavedProject {
  kind: 'project'
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
  iosApp?: boolean
  iosConfig?: SavedIosConfig
  issueKeyPrefix?: string
}
export type SavedSidebarNode = SavedTabNode | SavedFolder | SavedProject

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
  tree?: SavedSidebarNode[]
  tabs?: SavedTab[] // legacy
  theme: string // a built-in name, or 'Custom'
  customTheme?: Record<string, string>
  bgColor?: string // user-chosen background color
  docFontSize?: number // markdown doc font size
  codeRoot?: string // base folder for the Cmd+P folder picker
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
      status: 'backlog' | 'todo' | 'wip' | 'done'
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
    payload?: { kind: string; [k: string]: unknown }
  }[]
}

export interface PaneInfo {
  cwd: string | null
  branch: string | null
  worktree: string | null // basename of the git toplevel (worktree/repo folder), or null
}

// A stored Claude conversation (one .jsonl under ~/.claude/projects/<cwd>/).
export interface ClaudeSession {
  id: string // session UUID (filename) — used with `claude --resume <id>`
  cwd: string | null
  summary: string // first user prompt (truncated)
  mtimeMs: number
}

// Real server-side usage from `GET /api/oauth/usage`. Each window's
// `utilization` is an already-computed 0-100 percentage; `resetsAt` is ms epoch.
// `error` set means the token was missing/expired or the request failed.
export interface ClaudeUsageWindow {
  utilization: number
  resetsAt: number
}
export interface ClaudeRealUsage {
  fiveHour: ClaudeUsageWindow | null
  sevenDay: ClaudeUsageWindow | null
  sevenDaySonnet: ClaudeUsageWindow | null
  modelName: string | null
  fetchedAt: number
  error?: 'no-token' | 'auth-expired' | 'network' | 'unavailable'
}

export interface DirEntry {
  name: string
  path: string
}
export interface DirListing {
  path: string
  parent: string | null
  dirs: DirEntry[]
}

export interface NbNode {
  name: string
  path: string
  kind: 'dir' | 'file'
  children?: NbNode[]
}

export interface Worktree {
  path: string
  branch: string | null
}
export interface WorktreeListing {
  root: string | null
  worktrees: Worktree[]
}

// ---- Database tool ----
export type DbEngine = 'postgres' | 'mysql' | 'sqlite'
export interface DbConfig {
  id: string
  engine: DbEngine
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  ssl?: boolean
  file?: string
}
export interface DbResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  command?: string
  error?: string
}
export interface DbObjects {
  tables: string[]
  views: string[]
  procedures: string[]
  error?: string
}

export interface DbColumn {
  name: string
  type: string
  nullable: boolean
  isPrimary: boolean
  isAutoIncrement: boolean
  hasDefault: boolean
}
export interface DbColumns {
  columns: DbColumn[]
  error?: string
}

export interface CraftermApi {
  createPty(opts: { cwd?: string; env?: Record<string, string>; shell?: string }): Promise<string>
  input(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  kill(id: string): void
  onData(cb: (id: string, data: string) => void): void
  onExit(cb: (id: string) => void): void
  adoptPane(id: string): void
  popoutOpen(paneId: string, title?: string): Promise<void>
  popoutConfirmClose(id: string): void
  popoutFocus(id: string): void
  onPopoutKilled(cb: (id: string) => void): void
  onPopoutConfirmClose(cb: (id: string) => void): void
  openImproveWindow(): Promise<void>
  improveWindowSetAlwaysOnTop(value: boolean): void
  loadState(): Promise<SavedState | null>
  saveState(data: SavedState): void
  paneInfo(id: string): Promise<PaneInfo>
  notify(title: string, body: string, paneId?: string): void
  openExternal(url: string): void
  onCloseActivePane(cb: () => void): void
  onAppQuitting(cb: () => void): void
  onFullscreenChange(cb: (isFullscreen: boolean) => void): void
  onFocusPane(cb: (id: string) => void): void
  listDir(path?: string): Promise<DirListing>
  listEntries(path?: string): Promise<{
    path: string
    entries: { name: string; path: string; isDir: boolean }[]
  }>
  ideOpen(path: string, ide: string): void
  listPlans(): Promise<DirEntry[]>
  plansForBranch(
    cwd: string,
    branch: string
  ): Promise<
    { name: string; path: string; ownerStableId: string | null; ownerSessionId: string | null }[]
  >
  // Aggregate every plan markdown under each project path's docs/plans dir
  // (newest first). Powers the Notebook "Plans" section.
  scanPlans(
    paths: string[]
  ): Promise<{ project: string; name: string; path: string; mtime: number }[]>
  // Subscribe to plan-folder changes detected by the main-process fs.watch. The
  // payload is the absolute plans directory that changed; the renderer should
  // refresh the plan list of every pane whose cwd resolves to that dir.
  onPlansChanged(cb: (plansDir: string) => void): () => void
  openMarkdown(path: string): void
  listWorktrees(cwd?: string): Promise<WorktreeListing>
  // Absolute path to the bundled iOS worktree helper script (ios-worktree.sh).
  iosWorktreeScript(): Promise<string>
  // Live status of a repo's iOS worktrees (built/installed/running per variant).
  iosWorktreeReport(repoRoot: string, cfg?: SavedIosConfig): Promise<IosWorktreeReport | null>
  // Terminate a worktree's variant on the target simulator.
  iosWorktreeStop(worktreePath: string, cfg?: SavedIosConfig): Promise<boolean>
  nbTree(): Promise<NbNode[]>
  nbRead(path: string): Promise<string>
  nbWrite(path: string, content: string): void
  nbMkdir(path: string): Promise<boolean>
  nbCreate(path: string): Promise<boolean>
  nbRename(path: string, name: string): Promise<boolean>
  nbMove(src: string, destDir: string): Promise<boolean>
  nbDelete(path: string): Promise<boolean>
  nbReveal(path: string): void
  openPath(path: string): void
  revealPath(path: string): void
  playSound(name: string): void
  playEventSound(event: 'question' | 'done'): void
  findAllMarkdown(root?: string): Promise<{ root: string; files: { path: string; name: string }[] }>
  findFiles(
    root?: string,
    exclude?: string[]
  ): Promise<{ root: string; files: { path: string; name: string }[] }>
  resolveFile(base: string, rel: string): Promise<string | null>
  readMd(path: string): Promise<string>
  readText(path: string): Promise<{ ok: boolean; text?: string; error?: string }>
  writeMd(path: string, content: string): Promise<boolean>
  gitStashList(id: string): Promise<{ ref: string; description: string }[]>
  gitBranches(id: string): Promise<string[]>
  claudeLatestSession(cwd?: string, since?: number): Promise<string | null>
  claudeSessions(): Promise<ClaudeSession[]>
  claudeSessionTitle(cwd: string, sessionId: string): Promise<string | null>
  // Coarse session state from the JSONL tail for the sidebar status dot.
  claudeSessionStatus(
    cwd: string,
    sessionId: string
  ): Promise<'in-progress' | 'question' | 'idle' | null>
  // Start a live watcher on this cwd's Claude project dir; fires
  // onClaudeSessionsChanged when a session jsonl (e.g. a /rename) is written.
  // Idempotent per cwd. Returns false if the dir can't be watched yet.
  watchClaudeSessions(cwd: string): Promise<boolean>
  onClaudeSessionsChanged(cb: (cwd: string) => void): () => void
  claudeUsageSummary(): Promise<{
    today: { inputTokens: number; outputTokens: number; cachedTokens: number; totalTokens: number }
    thisWeek: { inputTokens: number; outputTokens: number; cachedTokens: number; totalTokens: number }
    thisMonth: { inputTokens: number; outputTokens: number; cachedTokens: number; totalTokens: number }
    sessions: number
    lastModel: string | null
    lastSpeed: string | null
    thinkingDetected: boolean
    resetTimes: { day: number; week: number; month: number }
  }>
  claudeRealUsage(opts: {
    keychainService?: string
    fallbackToken?: string | null
    force?: boolean
  }): Promise<ClaudeRealUsage>
  secretsAvailable(): Promise<boolean>
  secretGet(entryId: string, key: string): Promise<string | null>
  secretSet(entryId: string, key: string, value: string): Promise<{ ok: boolean; error?: string }>
  secretDelete(entryId: string, key?: string): Promise<{ ok: boolean; error?: string }>
  todoRead(path?: string): Promise<string | null>
  todoWrite(path: string, content: string): Promise<boolean>
  zshCommands(): Promise<{ name: string; value: string }[]>
  dbConnect(config: DbConfig): Promise<{ ok: boolean; error?: string }>
  dbObjects(config: DbConfig): Promise<DbObjects>
  dbColumns(config: DbConfig, table: string): Promise<DbColumns>
  dbQuery(config: DbConfig, sql: string): Promise<DbResult>
  dbDisconnect(id: string): Promise<boolean>
  dbqList(connId: string): Promise<{ name: string; path: string }[]>
  dbqRead(connId: string, name: string): Promise<string>
  dbqWrite(connId: string, name: string, sql: string): Promise<boolean>
  dbqDelete(connId: string, name: string): Promise<boolean>
  appVersion(): Promise<string>
  appBuildInfo(): Promise<{ commit: string | null; commitCount: number | null } | null>
  repoGit(
    repoPath: string
  ): Promise<{ commit: string; commitCount: number; dirty: boolean } | null>
  deployBuild(repoPath: string, command: string): Promise<{ ok: boolean; error?: string }>
  deployKillAllPtys(): Promise<boolean>
  deploySwap(repoPath: string): Promise<boolean>
  deployWasUpdating(): Promise<boolean>
  dockerAvailable(): Promise<{ ok: boolean; version?: string; error?: string }>
  dockerContainers(): Promise<DockerRow[]>
  dockerImages(): Promise<DockerRow[]>
  dockerVolumes(): Promise<DockerRow[]>
  dockerNetworks(): Promise<DockerRow[]>
  dockerCompose(): Promise<DockerRow[]>
  dockerStats(): Promise<DockerRow[]>
  dockerInspect(kind: DockerKind, id: string): Promise<string>
  dockerLogs(id: string, tail?: number): Promise<string>
  dockerAction(
    kind: DockerKind | 'compose',
    action: string,
    id: string,
    configFile?: string
  ): Promise<{ ok: boolean; error?: string }>
  dockerPrune(target: string): Promise<{ ok: boolean; out?: string; error?: string }>
  prAvailable(cwd: string): Promise<{ ok: boolean; repo?: string; error?: string }>
  prList(cwd: string): Promise<{ ok: boolean; error?: string; prs: PullRequest[] }>
  prMerge(cwd: string, number: number, method: string): Promise<{ ok: boolean; error?: string }>
  prView(cwd: string, number: number): Promise<string>
  prDiff(cwd: string, number: number): Promise<{ ok: boolean; patch?: string; error?: string }>
  prComment(
    cwd: string,
    number: number,
    path: string,
    startLine: number,
    endLine: number,
    body: string
  ): Promise<{ ok: boolean; error?: string }>
}

export interface PrChecks {
  pass: number
  fail: number
  pending: number
  total: number
  state: 'success' | 'failure' | 'pending' | 'none'
}

export interface PullRequest {
  number: number
  title: string
  headRefName: string
  baseRefName: string
  state: string
  isDraft: boolean
  mergeable: string // MERGEABLE | CONFLICTING | UNKNOWN
  reviewDecision: string // APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | ''
  url: string
  comments: number
  checks: PrChecks
  updatedAt: string
}

export type DockerKind = 'container' | 'image' | 'volume' | 'network'

// Each docker `--format '{{json .}}'` row is a flat string map; field names vary
// by object kind (Names/Status for containers, Repository/Tag for images, …).
export type DockerRow = Record<string, string>

declare global {
  interface Window {
    crafterm: CraftermApi
  }
}
