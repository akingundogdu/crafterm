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
    repeat: 'none' | 'daily' | 'weekly' | 'interval'
    intervalMin?: number
    enabled: boolean
    firedAt?: number
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
  askProjectOnNew?: boolean // ask which project to open on a new terminal
  bindings?: Record<string, string> // keybinding overrides
  commandHistory?: string[] // app-tracked command history
  font?: SavedFont
  sidebar?: SavedSidebar
  dbTree?: SavedDbNode[] // Database tool: project/folder/connection tree
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
  loadState(): Promise<SavedState | null>
  saveState(data: SavedState): void
  paneInfo(id: string): Promise<PaneInfo>
  notify(title: string, body: string, paneId?: string): void
  openExternal(url: string): void
  onCloseActivePane(cb: () => void): void
  onAppQuitting(cb: () => void): void
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
  ): Promise<{ name: string; path: string; ownerStableId: string | null }[]>
  // Subscribe to plan-folder changes detected by the main-process fs.watch. The
  // payload is the absolute plans directory that changed; the renderer should
  // refresh the plan list of every pane whose cwd resolves to that dir.
  onPlansChanged(cb: (plansDir: string) => void): () => void
  openMarkdown(path: string): void
  listWorktrees(cwd?: string): Promise<WorktreeListing>
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
  playSound(name: string): void
  playEventSound(event: 'question' | 'done'): void
  findAllMarkdown(root?: string): Promise<{ root: string; files: { path: string; name: string }[] }>
  findFiles(
    root?: string,
    exclude?: string[]
  ): Promise<{ root: string; files: { path: string; name: string }[] }>
  resolveFile(base: string, rel: string): Promise<string | null>
  readMd(path: string): Promise<string>
  writeMd(path: string, content: string): Promise<boolean>
  gitStashList(id: string): Promise<{ ref: string; description: string }[]>
  gitBranches(id: string): Promise<string[]>
  claudeLatestSession(cwd?: string): Promise<string | null>
  claudeSessions(): Promise<ClaudeSession[]>
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
  deployBuild(repoPath: string, command: string): Promise<{ ok: boolean; error?: string }>
  deploySwap(repoPath: string): Promise<boolean>
  deployWasUpdating(): Promise<boolean>
}

declare global {
  interface Window {
    crafterm: CraftermApi
  }
}
