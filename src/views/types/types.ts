import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import type { NodeStatus, PaneRole, SavedNode } from '@repositories/state.types'
export type { NodeStatus, PaneRole } from '@repositories/state.types'

export type Dir = 'row' | 'col'

// A terminal session's internal split layout.
export type LayoutNode =
  | { type: 'leaf'; paneId: string }
  | { type: 'split'; dir: Dir; sizes: number[]; children: LayoutNode[] }

export type PaneStatus = 'running' | 'idle' | 'attention'

// A plan file row attached to a terminal pane. Ownership comes from either a
// `--pane-<uuid>` tag (`ownerStableId`, matched to pane.stableId) or a trailing
// `-<uuid>` Claude session id (`ownerSessionId`, matched to pane.claudeSessionId).
// Both null means a legacy/shared plan with no owner tag.
export interface PlanEntry {
  name: string
  // The plan-slug segment alone (branch prefix + owner/session tag stripped),
  // shown in the sidebar so long generated filenames stay readable.
  slug: string
  path: string
  // File mtime (ms). Used to auto-open only plans produced during the current
  // live session (mtime after the pane's Claude launch), not pre-existing ones
  // surfaced on resume / session-id capture.
  mtime: number
  ownerStableId: string | null
  ownerSessionId: string | null
}

export interface Pane {
  id: string
  // Stable identity that survives app restarts; exposed to the shell as
  // CRAFTERM_PANE_ID so Claude can encode it into plan filenames.
  stableId: string
  term: Terminal
  fit: FitAddon
  el: HTMLElement // persistent .pane-box (header + terminal)
  host: HTMLElement // terminal area
  statusEl: HTMLElement // bottom status bar (branch · worktree · cwd)
  htitle: HTMLElement // title span in the pane header
  ro: ResizeObserver
  busy: boolean
  busySince: number // timestamp of the current run's rising edge (idle -> busy)
  attention: boolean
  idleTimer: number | null
  title: string
  titleLocked: boolean
  cwd: string | null
  branch: string | null
  worktree: string | null // git worktree/repo folder name (status bar)
  // Literal last command run in this pane (captured by the zsh preexec hook).
  // Persisted for non-Claude panes so restore can pre-type it (without running).
  lastCommand: string | null
  plans: PlanEntry[] // docs/plans files matching this branch (filtered by ownership)
  claude: boolean // a Claude session — resumed on restore
  claudeSessionId: string | null // captured session id for `claude --resume <id>` on restore
  // ms timestamp captured just before `claude` is launched in this pane; used to
  // filter `claudeLatestSession(cwd, since)` so we only adopt session ids that
  // appeared after we spawned. Prevents picking up a sibling pane's session
  // (or a stale one) when multiple Claude panes share a cwd.
  claudeSpawnedAt: number | null
  // Once we've captured this pane's own session id, freeze it. The periodic
  // refresh would otherwise overwrite it with whichever jsonl is newest in the
  // shared cwd dir — the root of the cross-pane session-mixup bug.
  claudeSessionLocked: boolean
  // Last session custom-title (/rename) this pane observed. A session title that
  // DIFFERS from it is a fresh /rename — the newest explicit action — and may
  // override a locked title; an unchanged one never beats a lock. Persisted so a
  // restart can't mistake the stored title for a new rename.
  lastClaudeTitle: string | null
  bgColor: string | null // per-pane background override (null = global default)
  fontSize: number | null // per-pane font-size override (null = global default)
  trackProjectPath: string | null // time-tracking: project this terminal logs to
  trackFeatureId: string | null // time-tracking: feature this terminal logs to
  // Pane provenance: which sidebar project / application opened this terminal.
  // Drives the "Commands — <project>" and "Commands — <app>" sections in the
  // pane action menu. Null when the terminal was opened from a plain cwd flow.
  projectId: string | null
  appId: string | null
  // Daily-task this terminal is working on (assigned via the pane menu, or set
  // automatically by "Open in terminal"). Drives the header chip + the
  // "mark done on close?" prompt. Persisted as the multi-valued `tickets[]`;
  // the multi-ticket UI lands later (todo14) — for now this single field is the
  // in-memory source and serializes to/from tickets[0].
  dailyTaskId: string | null
  // Unified data model (stableId hub). Lifecycle status + pane role. Full status
  // wiring (busy→running, claude question→waiting) lands in phase F2; for now
  // these default at creation and round-trip through persistence.
  status: NodeStatus
  role: PaneRole
  // True when this pane is a transient VIEW onto a background process (its id is
  // the process stableId). Closing the view must NOT kill the underlying PTY.
  isProcessView?: boolean
  lastActivity: number // ms of last terminal output/input (idle detection)
  lastNotify: number
  lastCols: number // last cols/rows pushed to the PTY; lets us skip no-op resizes
  lastRows: number //   (a tab-switch reattach must not fire a spurious SIGWINCH)
  // Rolling tail of recent terminal output (ANSI-stripped). Only retained for
  // Claude panes; used to distinguish "task done" from "Claude is waiting on a
  // question" when the idle-timer fires.
  outputTail: string
  // True once refreshPanePlans has populated `plans` at least once — guards the
  // auto-open so existing plans aren't re-opened on every launch.
  plansSynced?: boolean
  // True once a plan this pane owns has been auto-opened; surfaces the "Clarify"
  // action in the pane menu (plan-mode workflow).
  planMode?: boolean
  // Claude session state derived from the session JSONL (sidebar status dot):
  // 'in-progress' (assistant working), 'question' (awaiting the user), 'idle'.
  claudeStatus?: 'in-progress' | 'question' | 'idle'
}

// An embedded browser shown as a pane (a terminal link opened in-app).
export interface BrowserPane {
  id: string
  el: HTMLElement // persistent .pane-box wrapper
  webview: HTMLElement // <webview> element
  url: string
}

// A markdown note shown as a pane (rendered + editable), backed by a notebook file.
export interface DocPane {
  id: string
  el: HTMLElement
  relPath: string
}

// A SQL query editor + results, shown as a pane (replaces the old modal).
export interface SqlPane {
  id: string
  el: HTMLElement
  connId: string | null
  fileName: string | null
  themeName: string // Monaco editor theme name (see SQL_THEME_NAMES)
  getCode(): string
  focus(): void
}

// A read-only PR diff (from `gh pr diff`) shown as a pane. Selecting a line
// range and sending it pastes a `path:line` reference into a terminal so the
// user can ask Claude about that exact location. Transient — never persisted.
export interface DiffPane {
  id: string
  el: HTMLElement
  cwd: string
  prNumber: number
  // The terminal pane the selection is pasted into (captured at open time).
  targetPaneId: string | null
  // Cmd +/- font zoom for this pane (mirrors the terminal/doc pane behavior).
  setFont(delta: number): void
  resetFont(): void
}

// A read-only file viewer pane opened from the Files panel. Mirrors DiffPane's
// line-selection → terminal-reference flow, but shows a single plain file.
export interface FilePane {
  id: string
  el: HTMLElement
  // Absolute path of the file being viewed.
  path: string
  // The terminal pane the selection is pasted into (captured at open time).
  targetPaneId: string | null
  // Cmd +/- font zoom for this pane (mirrors the terminal/doc/diff pane behavior).
  setFont(delta: number): void
  resetFont(): void
}

// An editable code editor pane (CodeMirror 6) opened from the Files panel.
// Syntax-highlights by file extension and saves back to disk on Cmd+S.
export interface CodePane {
  id: string
  el: HTMLElement
  // Absolute path of the file currently being edited.
  readonly path: string
  // Current theme name (shared palette set with the SQL editor).
  themeName: string
  // True while the buffer has unsaved edits.
  isDirty(): boolean
  // Reopen this pane on a different file (single-editor reuse on file clicks);
  // optionally reveal a line (go-to-definition).
  openFile(path: string, line?: number): void
  // Cmd +/- font zoom for this pane (mirrors the terminal/doc/diff pane behavior).
  setFont(delta: number): void
  resetFont(): void
  focus(): void
}

export type NodeColor = string | null

// A terminal session shown as one row in the sidebar.
export interface TabNode {
  kind: 'tab'
  id: string
  title: string
  titleLocked: boolean
  color: NodeColor
  pinned: boolean
  root: LayoutNode
  detailsOpen?: boolean // sidebar row: show the detail line (default collapsed = title only)
  // Unified data model: a session is never deleted — closing flips status to
  // 'archived' (hidden from the sidebar, shown under "Show archived items").
  status?: NodeStatus
  // While archived, the serialized layout (with stableIds) is preserved here so
  // the session can be rebuilt on reactivate; the live `root` is an empty
  // placeholder until then.
  dormantRoot?: SavedNode
  // Set when the worktree-reconcile archived this tab because its worktree went
  // missing (not a user close). If the worktree reappears, un-archive reactivates
  // exactly these tabs — user-closed tabs (flag absent) stay archived.
  archivedByWorktree?: boolean
}

// A grouping folder in the sidebar (can nest up to MAX_FOLDER_DEPTH). A folder
// can act as a "company" container holding projects, and carries an optional
// `group` (workspace) label so it buckets under a top-level group header.
export interface FolderNode {
  kind: 'folder'
  id: string
  name: string
  color: NodeColor
  collapsed: boolean
  pinned: boolean
  children: SidebarNode[]
  group?: string // optional group (workspace) label for the top-level header
  feature?: string // when set, this is a feature/worktree folder (the branch name)
  // Auto-managed worktree nodes (reconcileWorktrees). The container holds one
  // worktree folder per `git worktree list` entry; the worktree folder records
  // its absolute path (the stable match key). Only marked nodes are auto-managed.
  worktreeContainer?: boolean // the auto "worktrees" container folder under a project
  worktreePath?: string // this folder is a worktree at this absolute path
  // per-folder defaults applied to terminals opened inside this folder
  startup?: string // command run on open
  env?: string // raw "KEY=VALUE" lines
  shell?: string // shell path override
}

// A project: a top-level grouping that carries a working directory. Like a
// folder, but with a `path` (used by cmd+T auto-select) and an optional `group`
// label (projects sharing a group are shown under a common header). Children may
// be folders, terminal tabs, or sub-projects. Apps + features (time-tracking
// labels) are owned by the project itself — the single source of truth.
export interface ProjectNode {
  kind: 'project'
  id: string
  name: string
  color: NodeColor
  collapsed: boolean
  pinned: boolean
  children: SidebarNode[]
  path: string // project working directory (cmd+T opens here)
  command?: string // optional startup command (e.g. claude)
  group?: string // optional group label for the sidebar header
  // per-node defaults applied to terminals opened inside this project
  startup?: string
  env?: string
  shell?: string
  apps?: Application[] // runnable applications under this project
  features?: Feature[] // time-tracking features under this project
  runCommands?: ProjectCommand[] // named one-shot shell commands (sidebar "Run command…")
  supportWorktree?: boolean // when true, auto-list this repo's git worktrees as folder nodes
  iosApp?: boolean // when true, add iOS build/run actions to the worktree nodes (implies supportWorktree)
  iosConfig?: IosDevConfig // per-project iOS build config (repo root = this node's path)
  issueKeyPrefix?: string // prefix for generated daily-task issue keys (e.g. CRF → CRF-12)
  // Transient hidden shells owned by the project (e.g. a `git worktree add` while
  // the worktree node doesn't exist yet). Not persisted.
  processes?: BackgroundProcess[]
}

// A hidden/background PTY (a "hidden shell") owned by a worktree — e.g. an iOS
// build/run. Surfaced as a small sub-row under the worktree; viewable on demand
// (attach + replay buffer) without killing it. Its lifetime is decoupled from any
// view. See the Background Processes design (F6).
export interface BackgroundProcess {
  stableId: string // UUID hub (exposed as CRAFTERM_PANE_ID), like a pane
  title: string // e.g. "Running on iPhone 16 simulator"
  role: PaneRole // 'build' for iOS run; extensible
  status: NodeStatus // running | done | archived | idle
  command: string // the shell command this process runs
  cwd: string
  target?: { kind: 'device' | 'simulator'; name: string; udid?: string }
}

// A git worktree as a first-class sidebar node (was a FolderNode + worktreePath
// marker). Behaves as a container (holds tabs/terminals) and carries its own
// lifecycle status (git 1:1: delete → `git worktree remove` + archived) plus any
// background build/run processes.
export interface WorktreeNode {
  kind: 'worktree'
  id: string
  name: string
  color: NodeColor
  collapsed: boolean
  pinned: boolean
  children: SidebarNode[]
  group?: string
  branch: string // the worktree's branch (was FolderNode.feature)
  worktreePath: string // absolute path — the stable match key against git
  status?: NodeStatus // active | archived (never deleted; mirrors git)
  // Transient: a `git worktree remove` is running in the background. Drives the
  // strikethrough + spinner row visual; cleared on success (→ archived) or
  // failure (→ revert). Not persisted.
  archiving?: boolean
  processes?: BackgroundProcess[] // hidden background shells (iOS build/run, …)
  // Last iOS run target chosen for this worktree — the ▶ play button re-runs it
  // (disabled until the first explicit run). (todo22)
  lastRun?: { kind: 'device' | 'simulator'; name: string; udid: string; scheme?: string }
  startup?: string
  env?: string
  shell?: string
}

export type SidebarNode = TabNode | FolderNode | ProjectNode | WorktreeNode

// One row of the sidebar "actions" (⋯) menu. A `builtin` item invokes a
// registered in-app action (modal/dashboard); a `command` item runs a shell
// command in a terminal (split beside the active pane, or a new tab).
export interface ActionMenuItem {
  id: string
  title: string
  kind: 'builtin' | 'command'
  builtinId?: string // key into BUILTIN_ACTIONS when kind === 'builtin'
  command?: string // shell command when kind === 'command'
  opensAs?: 'split' | 'tab' // placement for command items (default: tab)
  hidden?: boolean // kept in the list but not rendered in the menu
}

// The set of built-in actions selectable in the action-menu editor. The actual
// handlers live in sidebar.ts (they need the picker/modal imports); this is the
// id↔label catalog shared with the Settings editor + the default seed.
export const BUILTIN_ACTIONS: { id: string; label: string }[] = [
  { id: 'openProject', label: 'Open project…' },
  { id: 'commandPalette', label: 'Commands palette' },
  { id: 'claudeSessions', label: 'Claude sessions' },
  { id: 'resumeClaude', label: 'Resume Claude session' },
  { id: 'switchClaude', label: 'Switch Claude account' },
  { id: 'worktrees', label: 'Worktrees' },
  { id: 'sshConnections', label: 'My SSH connections' },
  { id: 'showPlans', label: 'Show all plans' },
  { id: 'commandHistory', label: 'Command history' },
  { id: 'updateZsh', label: 'Update my zsh config' },
  { id: 'improve', label: 'Improve Crafterm' },
  { id: 'updateCrafterm', label: 'Update Crafterm' },
  { id: 'dailyPlan', label: 'Daily plan' },
  { id: 'runningProcesses', label: 'Running processes' },
  { id: 'runningDevices', label: 'Running devices' }
]

// 'review' (code review) and 'test' are intermediate statuses with no board
// column of their own — their tasks render in the In Progress (wip) column.
export type DailyPlanStatus = 'backlog' | 'todo' | 'wip' | 'review' | 'test' | 'done'
export type DailyPlanPriority = 'low' | 'medium' | 'high'

export interface DailyPlanTask {
  id: string
  title: string
  description?: string // optional free-text notes
  date: string // YYYY-MM-DD; the day this card belongs to
  dueDate?: string // YYYY-MM-DD; optional target/deadline (drives the "time left" chip)
  status: DailyPlanStatus
  priority: DailyPlanPriority
  tagIds: string[]
  order: number // position within (date, status) for drag-drop ordering
  projectId?: string // owning ProjectNode id (gives cwd + issue-key prefix)
  issueKey?: string // stable key assigned once on task creation from the project prefix (e.g. CRF-12)
  worktreeSlug?: string // optional suffix appended to the issue key for the worktree branch/name (e.g. CRF-12-slug)
  createdAt: number
  updatedAt: number
}

export interface DailyPlanTag {
  id: string
  name: string
  color: string // hex
}

export interface DailyPlanData {
  tasks: DailyPlanTask[]
  tags: DailyPlanTag[]
}

// A structured meeting note (Notebook → Meeting Notes sub-tab).
export interface MeetingNote {
  id: string
  title: string
  date: string // YYYY-MM-DD
  attendees: string[]
  notes: string // free-text body
  projectId?: string // optional owning ProjectNode id
  archived?: boolean // hidden from the active list, shown in the Archived section
  createdAt: number
  updatedAt: number
}

export interface Font {
  family: string
  size: number
}

// Per-project iOS worktree configuration (a project node's Settings → iOS tab).
// The repo root is the owning ProjectNode's `path`. Every field is optional: an
// empty value means "auto-detect" inside the bundled ios-worktree.sh script, so
// each iOS project is fully independent.
export interface IosDevConfig {
  project: string // .xcodeproj/.xcworkspace name or path ('' = discover in repo)
  scheme: string // build scheme ('' = xcodebuild -list)
  baseBundleId: string // e.g. com.musicpal.pianopal ('' = read from build settings)
  displayPrefix: string // home-screen name prefix ('' = scheme name)
  defaultSimulator: string // simulator name ('' = booted, else first iPhone)
  copyFiles: string[] // gitignored local files copied into a fresh worktree (e.g. Secrets.xcconfig)
  worktreesDir: string // worktrees directory ('' = <repoParent>/worktrees)
}

// A runnable application under a catalog project: a per-environment launch
// command (e.g. dev/local/production). Not a sidebar node — running it later
// spawns a terminal. `path` is relative to the project path, or absolute.
export interface Application {
  id: string
  name: string
  path?: string // relative to the project path, or absolute; empty = project path
  opensAs?: 'tab' | 'split' // how a launched terminal is placed (default: tab)
  commands: Record<string, string> // environment name -> command (the dev command)
  // Optional named menu commands; surfaced in the pane action menu of any
  // terminal spawned from this application.
  runCommands?: ProjectCommand[]
}

// A one-shot named shell command tied to a project (e.g. "deploy", "lint").
// Runs in a terminal opened at the project's path; the user picks split vs new
// tab when launching from the sidebar.
export interface ProjectCommand {
  id: string
  name: string
  command: string
}

// Legacy catalog project shape. Kept only so old state files can be migrated
// into the unified sidebar tree on load (see loadSettings). Not produced or
// consumed at runtime any more — settings.projects no longer exists.
export interface Project {
  name: string
  path: string
  command?: string
  group?: string
  startup?: string
  env?: string
  shell?: string
  apps?: Application[]
  children?: Project[]
}

// A user-defined command shown in the command palette under a category chip
// (e.g. "predefined", "git", "linux"). Selecting it types `command` into the
// active terminal without running it.
export interface PaletteCommand {
  id: string
  category: string
  name: string
  command: string
}

// A saved SSH connection shown in the sidebar action menu. The password is
// stored as plaintext (the user's explicit choice) and is never auto-typed into
// the terminal — it is only surfaced for manual copy/paste.
export interface SshConnection {
  id: string
  label: string
  host: string
  user?: string
  port?: number
  password?: string
}

// A feature under a project (a time-tracking label; not a sidebar node).
// The owning project is the ProjectNode that holds this Feature in its
// `features[]` array — the parent relationship is structural, not by id.
export interface Feature {
  id: string
  name: string
}

// One logged work interval, attributed to a project (and optionally a feature).
export interface TimeEntry {
  id: string
  projectPath: string
  featureId?: string
  start: number // ms epoch
  end: number // ms epoch
  source: 'manual' | 'pomodoro' | 'auto'
}

// A user reminder that fires (OS + panel notification + sound) at `time`.
// What a reminder/notification points to so its click handler can open the
// right thing. `kind` is the discriminator; each variant carries the minimum
// needed to resolve the target later (an id, an absolute path, etc.).
export type ReminderPayload =
  | { kind: 'bookmark'; bookmarkId: string }
  | { kind: 'pane'; paneId: string }
  | { kind: 'notebook'; path: string }
  | { kind: 'dailyTask'; taskId: string }
  | { kind: 'plan'; path: string }
  | { kind: 'meetingNote'; noteId: string }

// A configurable quick-time chip in the reminder form. `offsetMin` is a relative
// offset from now; `days` jumps that many days ahead and, when `snapHour` is set,
// snaps to the user's default reminder hour at :00.
export interface ReminderPreset {
  label: string
  offsetMin?: number
  days?: number
  snapHour?: boolean
}

export interface ReminderDefaults {
  defaultHour: number // hour-of-day used by "Tomorrow"-style presets (0–23)
  presets: ReminderPreset[]
}

// Repeating reminders re-schedule `time` after firing; one-shots stay in the
// list as "past" (enabled=false, firedAt set) so they can be re-armed.
export interface Reminder {
  id: string
  text: string
  time: number // next fire timestamp (ms since epoch)
  repeat: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'interval'
  intervalMin?: number // minutes, when repeat === 'interval'
  enabled: boolean
  firedAt?: number // when a one-shot last fired (shown under "Past reminders")
  payload?: ReminderPayload // what the reminder is about (drives the card's Open action)
  category?: 'normal' | 'bookmark' | 'link' | 'dailyTask' // type chosen in the form
}

// One row in the Accounts sidebar mode. `kind` separates a full credential
// ledger entry ('account', with multiple fields) from a quick env-var-style
// 'secret' that's mainly a single value. Secret-flagged fields' values live in
// Electron safeStorage, NOT in this object — the renderer must resolve them via
// `secretGet(entryId, fieldKey)` when needed.
export interface AccountField {
  key: string
  value?: string // only present for non-secret fields
  secret?: boolean // true → value resolved at access time via IPC, not stored here
}
export interface AccountEntry {
  id: string
  kind: 'account' | 'secret'
  service?: string // e.g. "GitHub", "AWS"
  label: string // user-visible name (account alias, secret name)
  login?: string
  url?: string
  notes?: string
  tags: string[] // free-form labels (often project names)
  fields: AccountField[]
  createdAt: number
  updatedAt: number
}

// A saved bookmark in the right-panel "Bookmarks" tab. `content` is the URL for
// links and the body for text/code/snippet. `tags` drive the filter chips.
export interface Bookmark {
  id: string
  type: 'link' | 'text' | 'code' | 'snippet'
  title: string
  content: string
  tags: string[]
  language?: string // optional hint for code/snippet
  createdAt: number
}

// Extra context attached to a notification card (folder/git/cwd detail, or the
// reminder it came from so the card can offer snooze actions).
export interface NotificationMeta {
  kind?: 'pane' | 'reminder' // default 'pane'
  // what triggered a pane notification — drives the card's accent color:
  // 'question' = pane wants attention (bell), 'done' = a command finished.
  event?: 'question' | 'done'
  branch?: string | null
  worktree?: string | null
  cwd?: string | null
  reminderText?: string // present on reminder cards (used by snooze)
  projectColor?: string // optional hex tag color from the producing pane's project
  payload?: ReminderPayload // forwarded from the reminder; drives the card's Open action
  // The producing pane's STABLE id. `paneId` is a runtime id that is regenerated on
  // restore, so a persisted notification's paneId points at nothing after a restart —
  // this is the durable link back to the terminal.
  paneStableId?: string
}

// A notification card shown in the right notification panel.
export interface AppNotification extends NotificationMeta {
  id: string
  paneId: string
  title: string // pane title
  group: string // folder/project path of the pane (may be empty)
  message: string
  time: number
}

// ---- Database tool ----
export type DbEngine = 'postgres' | 'mysql' | 'sqlite'

// A saved database connection (password stored plaintext, the user's choice).
export interface DbConnection {
  id: string
  name: string
  engine: DbEngine
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  ssl?: boolean
  file?: string // sqlite db file path
}

// The Database sidebar tree: nestable groups (projects/folders) + connection leaves.
export interface DbGroup {
  kind: 'group'
  id: string
  name: string
  collapsed: boolean
  color?: NodeColor
  children: DbNode[]
}
export interface DbConnNode {
  kind: 'conn'
  id: string
  collapsed: boolean
  color?: NodeColor
  conn: DbConnection
}
export type DbNode = DbGroup | DbConnNode

export interface SidebarPrefs {
  size: number
  orientation: 'left' | 'top'
  fontSize: number
  collapsed: boolean
  details: { status: boolean; git: boolean; panes: boolean; paneList: boolean }
  // When true, the sidebar's top-level rows are bucketed by last activity
  // (Today / Yesterday / Earlier) instead of by workspace group.
  groupByRecency?: boolean
}

export const MAX_FOLDER_DEPTH = 4
