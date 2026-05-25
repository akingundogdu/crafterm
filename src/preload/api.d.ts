// ---- Pane layout (split tree) ----
export interface SavedLeaf {
  type: 'leaf'
  title?: string // only persisted when the pane name was set manually
  titleLocked?: boolean
  cwd?: string // restore the terminal in its last working directory
  claude?: boolean // a Claude session — resumed on restore
  claudeSessionId?: string // exact session to `claude --resume <id>` on restore
  bgColor?: string // per-pane background override
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
  startup?: string
  env?: string
  shell?: string
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
}
export type SavedSidebarNode = SavedTabNode | SavedFolder | SavedProject

// ---- Legacy (pre-folders) tab list, kept for one-time migration ----
export interface SavedTab {
  title: string
  titleLocked: boolean
  root: SavedNode
}

// ---- Catalog (Settings → Projects): a tree of projects + their applications ----
export interface SavedApplication {
  id: string
  name: string
  path?: string
  opensAs?: 'tab' | 'split'
  commands: Record<string, string>
}
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
  details: { status: boolean; git: boolean; panes: boolean }
}

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
  commands?: { ide?: string; openMyZsh?: string; mdFolders?: string[] } // commands + md filter folders
  projects?: SavedCatalogProject[] // catalog projects (tree)
  environments?: string[] // global environment names (dev/local/production)
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
  openMarkdown(path: string): void
  listWorktrees(cwd?: string): Promise<WorktreeListing>
  nbTree(): Promise<NbNode[]>
  nbRead(path: string): Promise<string>
  nbWrite(path: string, content: string): void
  nbMkdir(path: string): Promise<boolean>
  nbCreate(path: string): Promise<boolean>
  nbRename(path: string, name: string): Promise<boolean>
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
}

declare global {
  interface Window {
    crafterm: CraftermApi
  }
}
