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
  claude?: boolean // a Claude session — resumed on restore
  claudeSessionId?: string // exact session to `claude --resume <id>` on restore
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
  editorTheme?: string // global Monaco theme name for the code + SQL editors
  docFontSize?: number // markdown doc font size
  codeRoot?: string // base folder for the Cmd+P folder picker
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
    payload?: { kind: string; [k: string]: unknown }
  }[]
}

export interface PaneInfo {
  cwd: string | null
  branch: string | null
  worktree: string | null // basename of the git toplevel (worktree/repo folder), or null
  // Literal last command captured by the zsh preexec hook (keyed by stableId),
  // or null when none recorded yet. Only read when a stableId is passed.
  lastCommand?: string | null
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
export interface BacklogItem {
  id: string
  text: string
  status: string
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

// The bridge is namespaced by domain (window.crafterm.git.*, crafterm.pty.*, …).
// Each sub-interface mirrors the renderer's services/ipc/* wrapper of the same
// name, so the wrappers forward straight through (see _forward.ts `call`).

export interface TerminalApi {
  createPty(opts: { cwd?: string; env?: Record<string, string>; shell?: string }): Promise<string>
  input(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  kill(id: string): void
  onData(cb: (id: string, data: string) => void): void
  onExit(cb: (id: string) => void): void
  adoptPane(id: string): void
  paneInfo(id: string, stableId?: string): Promise<PaneInfo>
  onCloseActivePane(cb: () => void): void
  onFocusPane(cb: (id: string) => void): void
  popoutOpen(paneId: string, title?: string): Promise<void>
  popoutConfirmClose(id: string): void
  popoutFocus(id: string): void
  onPopoutKilled(cb: (id: string) => void): void
  onPopoutConfirmClose(cb: (id: string) => void): void
  // Background processes ("hidden shells"): run a one-shot command in a PTY keyed
  // by stableId, buffered in main so a view can attach + replay. Live data/exit
  // flow over the shared pty:data channel and the proc:exit channel.
  procStart(opts: {
    stableId: string
    command: string
    cwd?: string
    env?: Record<string, string>
  }): Promise<string>
  procBuffer(id: string): Promise<string>
  procAttach(id: string): void
  onProcExit(cb: (id: string, code: number) => void): void
}

export interface GitApi {
  branches(id: string): Promise<string[]>
  stashList(id: string): Promise<{ ref: string; description: string }[]>
  // Git working-tree status for Files-tree decorations: absolute path → kind.
  fileStatus(
    cwd: string
  ): Promise<Record<string, 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed'>>
  listWorktrees(cwd?: string): Promise<WorktreeListing>
  // Create (or attach an existing branch to) a worktree at `path`, awaiting it.
  worktreeAdd(repo: string, path: string, branch: string, base?: string): Promise<boolean>
}

export interface FsApi {
  listDir(path?: string): Promise<DirListing>
  listEntries(path?: string): Promise<{
    path: string
    entries: { name: string; path: string; isDir: boolean }[]
  }>
  findAllMarkdown(root?: string): Promise<{ root: string; files: { path: string; name: string }[] }>
  findFiles(
    root?: string,
    exclude?: string[]
  ): Promise<{ root: string; files: { path: string; name: string }[] }>
  resolveFile(base: string, rel: string): Promise<string | null>
  readMd(path: string): Promise<string>
  readText(path: string): Promise<{ ok: boolean; text?: string; error?: string }>
  writeMd(path: string, content: string): Promise<boolean>
  // Write any text file back to disk (code editor save). Only overwrites an
  // existing regular file; returns false on failure.
  writeText(path: string, content: string): Promise<boolean>
  // Files-tree management. Each refuses to clobber an existing path and returns
  // false on failure. `trashPath` moves to the system Trash (recoverable).
  createFile(path: string): Promise<boolean>
  mkdir(path: string): Promise<boolean>
  renamePath(from: string, to: string): Promise<boolean>
  trashPath(path: string): Promise<boolean>
  // Resolve a relative import specifier (from `fromFile`) to an absolute source
  // file + the declaration line of `symbol` (go-to-definition for imports).
  // Returns null for bare modules or non-existent paths.
  resolveImport(
    fromFile: string,
    spec: string,
    symbol?: string
  ): Promise<{ path: string; line: number } | null>
  ideOpen(path: string, ide: string): void
  openPath(path: string): void
  revealPath(path: string): void
  openMarkdown(path: string): void
}

export interface ClaudeApi {
  latestSession(cwd?: string, since?: number): Promise<string | null>
  // Recover a session's working directory from its jsonl (the `cwd` field), used
  // to resume a Claude pane whose saved cwd was lost. Null if not found.
  sessionCwd(sessionId: string): Promise<string | null>
  sessions(): Promise<ClaudeSession[]>
  sessionTitle(cwd: string, sessionId: string): Promise<string | null>
  // Coarse session state from the JSONL tail for the sidebar status dot.
  sessionStatus(
    cwd: string,
    sessionId: string
  ): Promise<'in-progress' | 'question' | 'idle' | null>
  // Live permission mode of a Claude session from the JSONL's last
  // permission-mode record. 'plan' means the session is in plan mode right now.
  permissionMode(
    cwd: string,
    sessionId: string
  ): Promise<'plan' | 'default' | 'auto' | 'acceptEdits' | string | null>
  // Start a live watcher on this cwd's Claude project dir; fires onSessionsChanged
  // when a session jsonl (e.g. a /rename) is written. Idempotent per cwd.
  watchSessions(cwd: string): Promise<boolean>
  onSessionsChanged(cb: (cwd: string) => void): () => void
  usageSummary(): Promise<{
    today: { inputTokens: number; outputTokens: number; cachedTokens: number; totalTokens: number }
    thisWeek: { inputTokens: number; outputTokens: number; cachedTokens: number; totalTokens: number }
    thisMonth: { inputTokens: number; outputTokens: number; cachedTokens: number; totalTokens: number }
    sessions: number
    lastModel: string | null
    lastSpeed: string | null
    thinkingDetected: boolean
    resetTimes: { day: number; week: number; month: number }
  }>
  realUsage(opts: {
    keychainService?: string
    fallbackToken?: string | null
    force?: boolean
  }): Promise<ClaudeRealUsage>
}

export interface NotebookApi {
  tree(): Promise<NbNode[]>
  read(path: string): Promise<string>
  write(path: string, content: string): void
  mkdir(path: string): Promise<boolean>
  create(path: string): Promise<boolean>
  rename(path: string, name: string): Promise<boolean>
  move(src: string, destDir: string): Promise<boolean>
  delete(path: string): Promise<boolean>
  reveal(path: string): void
}

export interface PlansApi {
  list(): Promise<DirEntry[]>
  forBranch(
    cwd: string,
    branch: string
  ): Promise<
    {
      name: string
      slug: string
      path: string
      mtime: number
      ownerStableId: string | null
      ownerSessionId: string | null
    }[]
  >
  // Aggregate every plan markdown under each project path's docs/plans dir
  // (newest first). Powers the Notebook "Plans" section.
  scan(paths: string[]): Promise<{ project: string; name: string; path: string; mtime: number }[]>
  // Subscribe to plan-folder changes detected by the main-process fs.watch. The
  // payload is the absolute plans directory that changed; the renderer should
  // refresh the plan list of every pane whose cwd resolves to that dir.
  onChanged(cb: (plansDir: string) => void): () => void
}

export interface DbApi {
  connect(config: DbConfig): Promise<{ ok: boolean; error?: string }>
  objects(config: DbConfig): Promise<DbObjects>
  columns(config: DbConfig, table: string): Promise<DbColumns>
  query(config: DbConfig, sql: string): Promise<DbResult>
  disconnect(id: string): Promise<boolean>
  savedList(connId: string): Promise<{ name: string; path: string }[]>
  savedRead(connId: string, name: string): Promise<string>
  savedWrite(connId: string, name: string, sql: string): Promise<boolean>
  savedDelete(connId: string, name: string): Promise<boolean>
}

export interface DockerApi {
  available(): Promise<{ ok: boolean; version?: string; error?: string }>
  containers(): Promise<DockerRow[]>
  images(): Promise<DockerRow[]>
  volumes(): Promise<DockerRow[]>
  networks(): Promise<DockerRow[]>
  compose(): Promise<DockerRow[]>
  stats(): Promise<DockerRow[]>
  inspect(kind: DockerKind, id: string): Promise<string>
  logs(id: string, tail?: number): Promise<string>
  action(
    kind: DockerKind | 'compose',
    action: string,
    id: string,
    configFile?: string
  ): Promise<{ ok: boolean; error?: string }>
  prune(target: string): Promise<{ ok: boolean; out?: string; error?: string }>
}

export interface PrApi {
  available(cwd: string): Promise<{ ok: boolean; repo?: string; error?: string }>
  list(cwd: string): Promise<{ ok: boolean; error?: string; prs: PullRequest[] }>
  repos(
    root: string
  ): Promise<{ ok: boolean; error?: string; repos: { name: string; path: string }[] }>
  listAll(
    root: string,
    paths: string[]
  ): Promise<{ ok: boolean; error?: string; projects: ProjectPullRequests[] }>
  merge(cwd: string, number: number, method: string): Promise<{ ok: boolean; error?: string }>
  view(cwd: string, number: number): Promise<string>
  diff(cwd: string, number: number): Promise<{ ok: boolean; patch?: string; error?: string }>
  comment(
    cwd: string,
    number: number,
    path: string,
    startLine: number,
    endLine: number,
    body: string
  ): Promise<{ ok: boolean; error?: string }>
  runs(cwd: string): Promise<{ ok: boolean; error?: string; runs: WorkflowRun[] }>
  runJobs(cwd: string, id: number): Promise<string>
  deployments(cwd: string): Promise<{ ok: boolean; error?: string; deployments: DeploymentStatus[] }>
  deploysAll(
    root: string,
    paths: string[]
  ): Promise<{ ok: boolean; error?: string; projects: ProjectDeployments[] }>
}

export interface SecretsApi {
  available(): Promise<boolean>
  get(entryId: string, key: string): Promise<string | null>
  set(entryId: string, key: string, value: string): Promise<{ ok: boolean; error?: string }>
  delete(entryId: string, key?: string): Promise<{ ok: boolean; error?: string }>
}

export interface IosApi {
  // Absolute path to the bundled iOS worktree helper script (ios-worktree.sh).
  worktreeScript(): Promise<string>
  // Live status of a repo's iOS worktrees (built/installed/running per variant).
  worktreeReport(repoRoot: string, cfg?: SavedIosConfig): Promise<IosWorktreeReport | null>
  // Terminate a worktree's variant on the target simulator.
  worktreeStop(worktreePath: string, cfg?: SavedIosConfig): Promise<boolean>
  // Available iOS run targets for the worktree "Build & Run" picker.
  listTargets(): Promise<{
    simulators: { name: string; udid: string }[]
    devices: { name: string; udid: string }[]
  }>
  // Xcode scheme names for the project (e.g. "local" / "prod").
  listSchemes(repoRoot: string, cfg?: SavedIosConfig): Promise<string[]>
}

export interface AppApi {
  version(): Promise<string>
  buildInfo(): Promise<{ commit: string | null; commitCount: number | null } | null>
  buildCounter(repoPath: string): Promise<number | null>
  repoGit(
    repoPath: string
  ): Promise<{ commit: string; commitCount: number; dirty: boolean } | null>
  deployBuild(repoPath: string, command: string): Promise<{ ok: boolean; error?: string }>
  deployKillAllPtys(): Promise<boolean>
  deploySwap(repoPath: string): Promise<boolean>
  deployWasUpdating(): Promise<boolean>
  openExternal(url: string): void
  notify(title: string, body: string, paneId?: string): void
  // Read a monaco-themes theme JSON by display name (e.g. "Monokai"). Returns the
  // parsed IStandaloneThemeData object, or null on failure.
  monacoTheme(name: string): Promise<Record<string, unknown> | null>
  zshCommands(): Promise<{ name: string; value: string }[]>
  todoRead(path?: string): Promise<string | null>
  todoWrite(path: string, content: string): Promise<boolean>
  backlogRead(): Promise<{ path: string; items: BacklogItem[] } | null>
  playSound(name: string): void
  playEventSound(event: 'question' | 'done'): void
  onAppQuitting(cb: () => void): void
  onFullscreenChange(cb: (isFullscreen: boolean) => void): void
  openImproveWindow(): Promise<void>
  improveWindowSetAlwaysOnTop(value: boolean): void
}

export interface StoreApi {
  load(): Promise<SavedState | null>
  save(data: SavedState): void
}

export interface CraftermApi {
  terminal: TerminalApi
  git: GitApi
  fs: FsApi
  claude: ClaudeApi
  notebook: NotebookApi
  plans: PlansApi
  db: DbApi
  docker: DockerApi
  pr: PrApi
  secrets: SecretsApi
  ios: IosApi
  app: AppApi
  store: StoreApi
}

export interface WorkflowRun {
  id: number
  name: string
  title: string
  status: string // queued | in_progress | completed
  conclusion: string // success | failure | cancelled | '' while running
  event: string
  headBranch: string
  headSha: string
  url: string
  createdAt: string
}

export interface DeploymentStatus {
  id: number
  environment: string
  ref: string
  state: string // pending | in_progress | success | failure | error | inactive
  description: string
  url: string
  createdAt: string
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

// One project (git repo) under the code root, with its open PRs.
export interface ProjectPullRequests {
  name: string
  path: string
  repo: string
  prs: PullRequest[]
}

// One project (git repo) under the code root, with its deployments + CI runs.
export interface ProjectDeployments {
  name: string
  path: string
  deployments: DeploymentStatus[]
  runs: WorkflowRun[]
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
