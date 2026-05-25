import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'

export type Dir = 'row' | 'col'

// A terminal session's internal split layout.
export type LayoutNode =
  | { type: 'leaf'; paneId: string }
  | { type: 'split'; dir: Dir; sizes: number[]; children: LayoutNode[] }

export type PaneStatus = 'running' | 'idle' | 'attention'

export interface Pane {
  id: string
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
  claude: boolean // a Claude session — resumed on restore
  claudeSessionId: string | null // captured session id for `claude --resume <id>` on restore
  bgColor: string | null // per-pane background override (null = global default)
  fontSize: number | null // per-pane font-size override (null = global default)
  trackProjectPath: string | null // time-tracking: project this terminal logs to
  trackFeatureId: string | null // time-tracking: feature this terminal logs to
  lastActivity: number // ms of last terminal output/input (idle detection)
  lastNotify: number
  lastCols: number // last cols/rows pushed to the PTY; lets us skip no-op resizes
  lastRows: number //   (a tab-switch reattach must not fire a spurious SIGWINCH)
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
  // per-folder defaults applied to terminals opened inside this folder
  startup?: string // command run on open
  env?: string // raw "KEY=VALUE" lines
  shell?: string // shell path override
}

// A project: a top-level grouping that carries a working directory. Like a
// folder, but with a `path` (used by cmd+T auto-select) and an optional `group`
// label (projects sharing a group are shown under a common header). Children may
// be folders/tabs (and, later, features).
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
}

export type SidebarNode = TabNode | FolderNode | ProjectNode

export interface Font {
  family: string
  size: number
}

// A runnable application under a catalog project: a per-environment launch
// command (e.g. dev/local/production). Not a sidebar node — running it later
// spawns a terminal. `path` is relative to the project path, or absolute.
export interface Application {
  id: string
  name: string
  path?: string // relative to the project path, or absolute; empty = project path
  opensAs?: 'tab' | 'split' // how a launched terminal is placed (default: tab)
  commands: Record<string, string> // environment name -> command
}

// A saved catalog project: open a terminal at `path`, optionally running
// `command`. The per-node defaults (startup/env/shell) are copied onto the
// project's sidebar node so terminals opened inside inherit them. The catalog is
// a tree (projects can hold sub-projects) and is separate from the live sidebar.
export interface Project {
  name: string
  path: string
  command?: string
  group?: string // optional group (workspace) label (picker chip + sidebar header)
  startup?: string // command run in each terminal opened inside this project
  env?: string // raw "KEY=VALUE" lines applied to terminals in this project
  shell?: string // shell path override for terminals in this project
  apps?: Application[] // runnable applications defined under this project
  children?: Project[] // sub-projects (catalog tree)
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
export interface Feature {
  id: string
  projectPath: string // the project this feature belongs to (path = identity)
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
// Repeating reminders re-schedule `time` after firing; one-shots stay in the
// list as "past" (enabled=false, firedAt set) so they can be re-armed.
export interface Reminder {
  id: string
  text: string
  time: number // next fire timestamp (ms since epoch)
  repeat: 'none' | 'daily' | 'weekly' | 'interval'
  intervalMin?: number // minutes, when repeat === 'interval'
  enabled: boolean
  firedAt?: number // when a one-shot last fired (shown under "Past reminders")
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

export interface SidebarPrefs {
  size: number
  orientation: 'left' | 'top'
  fontSize: number
  collapsed: boolean
  details: { status: boolean; git: boolean; panes: boolean }
}

export const MAX_FOLDER_DEPTH = 4
