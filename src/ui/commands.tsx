import type {
  Dir,
  LayoutNode,
  SidebarNode,
  TabNode,
  FolderNode,
  ProjectNode,
  WorktreeNode,
  Application
} from './types'
import { MAX_FOLDER_DEPTH } from './types'
import {
  panes,
  browsers,
  docs,
  sqlPanes,
  diffPanes,
  filePanes,
  codePanes,
  poppedOut,
  state,
  settings,
  uid,
  requestSidebar,
  requestStatuses,
  renderContent,
  updateActive,
  updatePaneActive,
  applyDocFont
} from './state'
import { persistence } from '@services/storage/persistence.service'
import {
  firstPaneOf,
  panesInLayout,
  layoutContains,
  splitInLayout,
  removePaneFromLayout,
  movePaneInLayout,
  findById,
  findTab,
  findTabByPane,
  allTabs,
  isDescendant,
  depthOfFolder,
  subtreeFolderDepth,
  makeFolder,
  makeProject,
  projectOf,
  isContainer
} from './tree'
import { findProjectByPath } from './catalog'
import { iosWorktreeEnvFor } from './screens/ios-worktree/ios-worktree'
import {
  createPane,
  destroyPane,
  createBrowserPane,
  destroyBrowserPane,
  createDocPane,
  destroyDocPane,
  applyAppearance,
  paneStatus,
  refreshPaneDailyTask
} from './pane'
import { createSqlPane, destroySqlPane } from './screens/db-pane/db-pane'
import { createDiffPane, destroyDiffPane } from './screens/diff-pane/diff-pane'
import { createFilePane, destroyFilePane } from './screens/file-pane/file-pane'
import { createCodePane, destroyCodePane } from './screens/code-pane/code-pane'
import { promptText, promptForm, promptConfirm, promptCloseActions } from './dialog'
import { removeWorktree, worktreeForCwd } from '@services/worktrees'
import { terminalService, fsService } from '@services'
import { dailyTaskRepo } from '@services/storage/repositories'

function focusActivePane(): void {
  if (state.activePaneId) panes.get(state.activePaneId)?.term.focus()
}

// cwd of the currently active terminal, so a new terminal opens in the same
// place. Null falls back to the home dir (handled in the main process).
function activeCwd(): string | undefined {
  return (state.activePaneId ? panes.get(state.activePaneId)?.cwd : null) ?? undefined
}

// The cached pane.cwd only refreshes periodically, so a split right after `cd`
// could inherit a stale directory. Query the pty for its live cwd, caching the
// result, and fall back to the cached value if the lookup fails.
async function liveCwd(paneId: string | null | undefined): Promise<string | undefined> {
  if (!paneId) return undefined
  try {
    const info = await terminalService.paneInfo(paneId)
    if (info?.cwd) {
      const p = panes.get(paneId)
      if (p) p.cwd = info.cwd
      return info.cwd
    }
  } catch {
    /* fall through to the cached cwd */
  }
  return panes.get(paneId)?.cwd ?? undefined
}

// ---- Creating ----

export async function newTab(parentFolderId?: string | null, cwd?: string): Promise<void> {
  const n = allTabs(state.tree).length + 1
  await createTab(parentFolderId, { title: 'zsh ' + n, cwd })
}

// A terminal that auto-runs the Claude Code CLI in its starting directory.
export async function newClaudeTab(parentFolderId?: string | null, cwd?: string): Promise<void> {
  await createTab(parentFolderId, {
    // 'Claude' is just the starting label; leave the tab unlocked so the Claude
    // session title (a /rename inside the session) drives the sidebar label. The
    // terminal's own OSC title can't clobber it — onPaneTitle ignores OSC titles
    // for Claude panes. A manual sidebar rename still locks it (setNodeName).
    title: 'Claude',
    command: 'claude',
    claude: true,
    cwd
  })
}

// Bake the pane's stableId in as Claude's --session-id, unifying the two ids: the
// pane UUID (CRAFTERM_PANE_ID), the plan-file owner tag (`--pane-<stableId>`) and
// the Claude session id all become the SAME value. PATH/alias/.zshrc-proof —
// Crafterm tells Claude which id to use instead of relying on a shim winning
// command resolution. The id is already persisted via the pane's stableId, so
// restore (`claude --resume <stableId>`) and the sidebar map this pane to its
// exact session with zero ambiguity, and the post-spawn session-capture polling
// is unnecessary for these launches. Skips launches that already select a session
// (--resume/-c/--session-id) or print mode, and anything not launching `claude`.
const CLAUDE_LAUNCH_RE = /(^|\s|&&|\|\||;|\|)claude(\s|$)/
function withClaudeSessionId(command: string, paneId: string): string {
  const pane = panes.get(paneId)
  if (!pane) return command
  if (/--resume\b|--continue\b|(^|\s)-[rc](\s|$)|--session-id\b|(^|\s)-p(\s|$)|--print\b/.test(command)) {
    return command
  }
  const m = CLAUDE_LAUNCH_RE.exec(command)
  if (!m) return command
  const sid = pane.stableId // unify: Claude session id === pane stableId
  pane.claude = true
  pane.claudeSessionId = sid
  pane.claudeSessionLocked = true
  persistence.save()
  const at = m.index + m[1].length + 'claude'.length
  return command.slice(0, at) + ` --session-id ${sid}` + command.slice(at)
}

// Single-quote a string for safe pasting into a zsh command line (newlines are
// preserved literally inside single quotes; embedded quotes are escaped).
function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

// Open a Claude terminal in `cwd` (nested under the given project/folder),
// seeded with an initial prompt and titled by `lockedTitle` (e.g. an issue key).
// The locked title means the Claude session's own /rename won't override it.
export async function openClaudeWithPrompt(
  parentFolderId: string | null,
  cwd: string,
  prompt: string,
  lockedTitle: string,
  dailyTaskId?: string
): Promise<void> {
  await createTab(parentFolderId, {
    title: lockedTitle,
    titleLocked: true,
    command: `claude ${shQuote(prompt)}`,
    claude: true,
    cwd,
    dailyTaskId
  })
}

async function createTab(
  parentFolderId: string | null | undefined,
  opts: {
    title: string
    titleLocked?: boolean
    command?: string
    claude?: boolean
    cwd?: string
    dailyTaskId?: string
  }
): Promise<void> {
  const folder = parentFolderId ? folderNodeById(parentFolderId) : null
  let env = folder?.env ? parseEnvLines(folder.env) : undefined
  // Inside an iOS worktree, inject CRAFTERM_IOS_SCRIPT + IOSWT_* so terminals (and
  // the /run-on-device skill) can build this worktree correctly (todo23).
  const iosEnv = parentFolderId ? await iosWorktreeEnvFor(parentFolderId) : null
  if (iosEnv) env = { ...(env ?? {}), ...iosEnv }
  const paneId = await createPane(opts.cwd ?? activeCwd(), {
    env,
    shell: folder?.shell?.trim() || undefined
  })
  // If the new tab is nested inside (or directly under) a ProjectNode, tag the
  // pane so the action menu can surface that project's run commands.
  const ownerProject = parentFolderId ? projectOf(state.tree, parentFolderId) : null
  if (ownerProject) {
    const p = panes.get(paneId)
    if (p) p.projectId = ownerProject.id
  }
  if (opts.claude) {
    const p = panes.get(paneId)
    if (p) {
      p.claude = true
      // Baseline so the session-id capture only adopts ids that appear AFTER
      // this pane spawns claude — avoids stealing a sibling pane's id when
      // multiple Claude panes share a cwd.
      p.claudeSpawnedAt = Date.now()
      p.claudeSessionLocked = false
    }
  }
  // A locked title (e.g. a daily-task issue key) must also lock the pane so the
  // Claude session's own /rename can't override it (applyClaudeSessionTitle bails
  // on pane.titleLocked).
  if (opts.titleLocked) {
    const p = panes.get(paneId)
    if (p) {
      p.title = opts.title
      p.titleLocked = true
      p.htitle.textContent = opts.title
    }
  }
  if (opts.dailyTaskId) {
    const p = panes.get(paneId)
    if (p) {
      p.dailyTaskId = opts.dailyTaskId
      refreshPaneDailyTask(paneId)
    }
  }
  const tab: TabNode = {
    kind: 'tab',
    id: uid('t'),
    title: opts.title,
    titleLocked: !!opts.titleLocked,
    color: null,
    pinned: false,
    root: { type: 'leaf', paneId }
  }
  const list = parentFolderId ? folderChildren(parentFolderId) : state.tree
  list.push(tab)
  if (parentFolderId) {
    const r = findById(state.tree, parentFolderId)
    if (r && isContainer(r.node)) r.node.collapsed = false // reveal the new tab
  }
  state.activeTabId = tab.id
  state.selectedNodeId = tab.id
  state.activePaneId = paneId
  requestSidebar()
  renderContent()
  focusActivePane()
  persistence.save()
  // The container's *startup* — a small shell init the user wants on every new
  // terminal in this group — always runs first. An explicit command (e.g.
  // "claude" for a Claude tab, or a project's `command` via `openProject`) is
  // chained after it, so the startup still applies: `startup && claude`. The
  // project's `command` is NOT auto-applied by plain cmd+T (no opts.command):
  // that must give a vanilla terminal; cmd+shift+T opens claude explicitly.
  const containerCmd = folder?.startup?.trim() || undefined
  const built =
    opts.command && containerCmd
      ? `${containerCmd} && ${opts.command}`
      : (opts.command ?? containerCmd)
  // Bake in a deterministic --session-id whenever the command launches Claude —
  // covers cmd+shift+T, "New Claude terminal", and a project whose command is
  // `claude` (see withClaudeSessionId). A no-op for non-Claude commands.
  const command = built ? withClaudeSessionId(built, paneId) : built
  // Let the login shell finish its init before injecting the command.
  if (command) setTimeout(() => terminalService.input(paneId, command + '\r'), 350)
}

function folderNodeById(id: string): FolderNode | ProjectNode | WorktreeNode | null {
  const r = findById(state.tree, id)
  return r && isContainer(r.node) ? r.node : null
}

function parseEnvLines(raw: string): Record<string, string> | undefined {
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
  }
  return Object.keys(env).length ? env : undefined
}

// Cmd+T: create the terminal inside the currently selected group. A folder
// selection drops it inside that folder; a tab selection drops it next to that
// tab (same group); no selection falls back to the root.
export async function newTabInContext(): Promise<void> {
  await newTab(contextFolderId())
}

// Cmd+Shift+T: same context resolution, but a Claude terminal.
export async function newClaudeTabInContext(): Promise<void> {
  await newClaudeTab(contextFolderId())
}

export function contextFolderId(): string | null {
  const id = state.selectedNodeId
  if (!id) return null
  const r = findById(state.tree, id)
  if (!r) return null
  if (isContainer(r.node)) return r.node.id
  return folderIdOfList(r.parent)
}

// Open a project as a new terminal: cwd = project.path, runs its command.
// Accepts either an existing ProjectNode (picker, sidebar) or a path-based spec
// (worktree picker — the path may not yet have a node, so one is created).
export async function openProject(
  p: ProjectNode | {
    name: string
    path: string
    command?: string
    group?: string
    startup?: string
    env?: string
    shell?: string
  },
  parentFolderId?: string | null
): Promise<void> {
  const proj = resolveProjectNode(p)
  const parentId = parentFolderId ?? proj.id
  await createTab(parentId, {
    title: proj.name,
    cwd: proj.path,
    command: proj.command && proj.command.trim() ? proj.command.trim() : undefined
  })
}

// Return the existing ProjectNode for this input, or create+attach a new one at
// the tree root. Used by openProject + run/feature flows that can be entered
// from a path-only context (worktree picker).
function resolveProjectNode(
  p:
    | ProjectNode
    | {
        name: string
        path: string
        command?: string
        group?: string
        startup?: string
        env?: string
        shell?: string
        apps?: Application[]
      }
): ProjectNode {
  if ('kind' in p && p.kind === 'project') return p
  const existing = findProjectByPath(state.tree, p.path)
  if (existing) return existing
  const proj = makeProject(uid('p'), p.name, p.path)
  if (p.command) proj.command = p.command
  if (p.group) proj.group = p.group
  if (p.startup) proj.startup = p.startup
  if (p.env) proj.env = p.env
  if (p.shell) proj.shell = p.shell
  if (p.apps && p.apps.length) proj.apps = p.apps.map((a) => ({ ...a }))
  state.tree.push(proj)
  return proj
}

// Resolve an application's working directory: empty = the project path; absolute
// (/ or ~) used as-is; otherwise relative to the project path.
export function resolveAppPath(projectPath: string, appPath?: string): string {
  const a = (appPath ?? '').trim()
  if (!a) return projectPath
  if (a.startsWith('/') || a.startsWith('~')) return a
  return projectPath.replace(/\/+$/, '') + '/' + a.replace(/^\.\//, '')
}

// Run a set of a project's applications for an environment, under the project's
// sidebar node. Each app's `opensAs` decides placement: 'split' apps share one
// tiled tab (a row split); 'tab' apps each open as their own tab. The
// environment is never a node — only a label on the tab/pane title.
export async function runApplications(
  project: ProjectNode,
  env: string,
  apps: Application[]
): Promise<void> {
  const runnable = apps.filter((a) => (a.commands?.[env] ?? '').trim())
  if (!runnable.length) return

  const parentId: string = project.id

  const projEnv = project.env ? parseEnvLines(project.env) : undefined
  const shell = project.shell?.trim() || undefined
  const startup = project.startup?.trim()
  const toRun: { paneId: string; cmd: string }[] = []
  const spawn = async (app: Application): Promise<string> => {
    const paneId = await createPane(resolveAppPath(project.path, app.path), { env: projEnv, shell })
    const p = panes.get(paneId)
    if (p) {
      p.title = `${app.name} · ${env}`
      p.titleLocked = true
      p.htitle.textContent = p.title
      p.projectId = project.id
      p.appId = app.id
    }
    // Run the project's startup (e.g. `nvm use`) first, chained with the app's
    // dev command so both run in order in the same shell.
    const dev = app.commands[env].trim()
    toRun.push({ paneId, cmd: startup ? `${startup} && ${dev}` : dev })
    return paneId
  }

  const list = parentId ? folderChildren(parentId) : state.tree
  let firstTabId: string | null = null
  let firstPaneId: string | null = null
  const pushTab = (title: string, root: LayoutNode): void => {
    const tab: TabNode = {
      kind: 'tab',
      id: uid('t'),
      title,
      titleLocked: true,
      color: null,
      pinned: false,
      root
    }
    list.push(tab)
    if (!firstTabId) {
      firstTabId = tab.id
      firstPaneId = firstPaneOf(root)
    }
  }

  // 'split' (default) apps tile into one tab; 'tab' apps each get their own tab.
  const splitApps = runnable.filter((a) => (a.opensAs ?? 'split') !== 'tab')
  const tabApps = runnable.filter((a) => (a.opensAs ?? 'split') === 'tab')

  if (splitApps.length) {
    const leaves: LayoutNode[] = []
    for (const app of splitApps) leaves.push({ type: 'leaf', paneId: await spawn(app) })
    const root: LayoutNode =
      leaves.length === 1
        ? leaves[0]
        : { type: 'split', dir: 'row', sizes: leaves.map(() => 1), children: leaves }
    pushTab(`${project.name} · ${env}`, root)
  }
  for (const app of tabApps) {
    pushTab(`${app.name} · ${env}`, { type: 'leaf', paneId: await spawn(app) })
  }

  if (parentId) {
    const r = findById(state.tree, parentId)
    if (r && isContainer(r.node)) r.node.collapsed = false
  }
  if (firstTabId) {
    state.activeTabId = firstTabId
    state.selectedNodeId = firstTabId
  }
  if (firstPaneId) state.activePaneId = firstPaneId
  requestSidebar()
  renderContent()
  focusActivePane()
  persistence.save()
  // let each login shell finish init before injecting its command
  for (const { paneId, cmd } of toRun) {
    setTimeout(() => terminalService.input(paneId, cmd + '\r'), 350)
  }
}

// Feature-setup: create a feature folder (marked as a worktree) under the project
// and open the selected applications inside it. Apps flagged for a worktree run
// the user's `run-create-worktree <branch> <base>` first (chained), so the dev
// command runs in the new worktree.
export async function createFeature(
  project: ProjectNode,
  opts: { branch: string; base: string; env: string; apps: { app: Application; worktree: boolean }[] }
): Promise<void> {
  const env = opts.env
  const selected = opts.apps.filter((x) => (x.app.commands?.[env] ?? '').trim())
  // No apps is fine — we still create the feature folder so the user has a
  // visible container to drop terminals into.
  const branch = opts.branch.trim() || project.name
  const base = opts.base.trim() || 'main'

  const projectId: string = project.id
  project.collapsed = false

  // the feature folder (a worktree-marked folder) under the project
  const folder = makeFolder(uid('f'), branch)
  folder.feature = branch
  ;(projectId ? folderChildren(projectId) : state.tree).push(folder)

  const projEnv = project.env ? parseEnvLines(project.env) : undefined
  const shell = project.shell?.trim() || undefined
  const startup = project.startup?.trim()
  const toRun: { paneId: string; cmd: string }[] = []
  const spawn = async (app: Application, wantsWorktree: boolean): Promise<string> => {
    const paneId = await createPane(resolveAppPath(project.path, app.path), { env: projEnv, shell })
    const p = panes.get(paneId)
    if (p) {
      p.title = `${app.name} · ${branch}`
      p.titleLocked = true
      p.htitle.textContent = p.title
      p.projectId = project.id
      p.appId = app.id
    }
    // Chain: create the worktree (if requested) → project startup → dev command,
    // so each runs in order in the same shell.
    const dev = app.commands[env].trim()
    const parts: string[] = []
    if (wantsWorktree) parts.push(`run-create-worktree ${shellQuote(branch)} ${shellQuote(base)}`)
    if (startup) parts.push(startup)
    parts.push(dev)
    toRun.push({ paneId, cmd: parts.join(' && ') })
    return paneId
  }

  const list = folderChildren(folder.id)
  let firstTabId: string | null = null
  let firstPaneId: string | null = null
  const pushTab = (title: string, root: LayoutNode): void => {
    const tab: TabNode = {
      kind: 'tab',
      id: uid('t'),
      title,
      titleLocked: true,
      color: null,
      pinned: false,
      root
    }
    list.push(tab)
    if (!firstTabId) {
      firstTabId = tab.id
      firstPaneId = firstPaneOf(root)
    }
  }

  const splitApps = selected.filter((x) => (x.app.opensAs ?? 'split') !== 'tab')
  const tabApps = selected.filter((x) => (x.app.opensAs ?? 'split') === 'tab')

  if (splitApps.length) {
    const leaves: LayoutNode[] = []
    for (const x of splitApps) leaves.push({ type: 'leaf', paneId: await spawn(x.app, x.worktree) })
    const root: LayoutNode =
      leaves.length === 1
        ? leaves[0]
        : { type: 'split', dir: 'row', sizes: leaves.map(() => 1), children: leaves }
    pushTab(`${branch} · ${env}`, root)
  }
  for (const x of tabApps) {
    pushTab(`${x.app.name} · ${branch}`, { type: 'leaf', paneId: await spawn(x.app, x.worktree) })
  }

  if (firstTabId) {
    state.activeTabId = firstTabId
    state.selectedNodeId = firstTabId
  }
  if (firstPaneId) state.activePaneId = firstPaneId
  requestSidebar()
  renderContent()
  focusActivePane()
  persistence.save()
  for (const { paneId, cmd } of toRun) {
    setTimeout(() => terminalService.input(paneId, cmd + '\r'), 350)
  }
}

// Move a container (project or company folder) into a group/workspace by dragging
// it onto a group header. Empty group clears it ("Ungrouped").
export function setNodeGroup(id: string, group: string): void {
  const r = findById(state.tree, id)
  if (!r || !isContainer(r.node)) return
  const g = group.trim()
  r.node.group = g || undefined
  requestSidebar()
  persistence.save()
}

// Create a new project node. Optional `parentId` nests it under another
// container; otherwise it lands at the tree root.
export async function createProject(parentId?: string | null): Promise<void> {
  const values = await promptForm({
    title: 'New project',
    fields: [
      { key: 'name', label: 'Name', placeholder: 'Movve' },
      { key: 'path', label: 'Path', placeholder: '~/code/movve' },
      { key: 'command', label: 'Command (optional)', placeholder: 'claude' },
      { key: 'group', label: 'Group (optional)', placeholder: 'Work' }
    ],
    confirmText: 'Create'
  })
  if (!values) return
  const name = (values.name || '').trim()
  const path = (values.path || '').trim()
  if (!name || !path) return
  const command = (values.command || '').trim()
  const group = (values.group || '').trim()
  const proj = makeProject(uid('p'), name, path)
  if (command) proj.command = command
  if (group) proj.group = group
  const list = parentId ? folderChildren(parentId) : state.tree
  list.push(proj)
  state.selectedNodeId = proj.id
  requestSidebar()
  persistence.save()
}

// The folder that owns a sibling list (null when the list is the tree root).
function folderIdOfList(list: SidebarNode[]): string | null {
  if (list === state.tree) return null
  const find = (nodes: SidebarNode[]): string | null => {
    for (const n of nodes) {
      if (isContainer(n)) {
        if (n.children === list) return n.id
        const r = find(n.children)
        if (r) return r
      }
    }
    return null
  }
  return find(state.tree)
}

// Cmd+Shift+N: create the folder inside the selected group (like newTabInContext).
export async function newFolderInContext(): Promise<void> {
  await newFolder(contextFolderId())
}

export async function newFolder(parentFolderId?: string | null): Promise<void> {
  if (parentFolderId) {
    const depth = depthOfFolder(state.tree, parentFolderId)
    if (depth >= MAX_FOLDER_DEPTH) {
      flash(`Max folder depth is ${MAX_FOLDER_DEPTH}`)
      return
    }
  }
  const name = await promptText({
    title: 'New folder',
    label: 'Name',
    placeholder: 'Folder name',
    confirmText: 'Create'
  })
  if (name === null) return
  const folder = makeFolder(uid('f'), name)
  const list = parentFolderId ? folderChildren(parentFolderId) : state.tree
  list.push(folder)
  if (parentFolderId) {
    const r = findById(state.tree, parentFolderId)
    if (r && isContainer(r.node)) r.node.collapsed = false // reveal the new folder
  }
  state.selectedNodeId = folder.id
  requestSidebar()
  persistence.save()
}

function folderChildren(folderId: string): SidebarNode[] {
  const r = findById(state.tree, folderId)
  return r && isContainer(r.node) ? r.node.children : state.tree
}

// ---- Splitting / closing panes ----

export async function splitActivePane(dir: Dir): Promise<void> {
  if (!state.activeTabId || !state.activePaneId) return
  const newPaneId = await createPane(await liveCwd(state.activePaneId))
  if (placeSplit(newPaneId, dir)) focusActivePane()
}

// Split a specific pane (used by the pane ⋯ menu, which targets that pane).
export async function splitPane(paneId: string, dir: Dir): Promise<void> {
  const tab = allTabs(state.tree).find((t) => layoutContains(t.root, paneId))
  if (!tab) return
  const newPaneId = await createPane(await liveCwd(paneId))
  tab.root = splitInLayout(tab.root, paneId, newPaneId, dir)
  state.activeTabId = tab.id
  state.activePaneId = newPaneId
  renderContent()
  updateActive()
  updatePaneActive()
  focusActivePane()
  persistence.save()
}

// Open a project (path + optional command) as a split to the right of the active
// pane — the openProject behaviour, but inside the current tab instead of a new one.
export async function splitProjectRight(
  p:
    | ProjectNode
    | { name: string; path: string; command?: string; env?: string; shell?: string }
): Promise<void> {
  if (!state.activeTabId || !state.activePaneId) return
  const newPaneId = await createPane(p.path, {
    env: p.env ? parseEnvLines(p.env) : undefined,
    shell: p.shell?.trim() || undefined
  })
  const command = p.command && p.command.trim() ? p.command.trim() : undefined
  const pane = panes.get(newPaneId)
  if (pane && command && /\bclaude\b/.test(command)) {
    pane.claude = true
    pane.claudeSpawnedAt = Date.now()
    pane.claudeSessionLocked = false
  }
  if (pane && 'kind' in p && p.kind === 'project') pane.projectId = p.id
  if (placeSplit(newPaneId, 'row')) {
    focusActivePane()
    if (command) setTimeout(() => terminalService.input(newPaneId, command + '\r'), 350)
  }
}

// Drag-to-rearrange: drop `dragId` onto a zone of `targetId` to re-lay-out.
export function movePaneByDrop(dragId: string, targetId: string, zone: string): void {
  const tab = allTabs(state.tree).find((t) => layoutContains(t.root, targetId))
  if (!tab || dragId === targetId || !layoutContains(tab.root, dragId)) return
  const dir: Dir = zone === 'left' || zone === 'right' ? 'row' : 'col'
  const before = zone === 'left' || zone === 'top'
  const newRoot = movePaneInLayout(tab.root, dragId, targetId, dir, before)
  if (!newRoot) return
  tab.root = newRoot
  renderContent()
  selectPane(dragId)
  persistence.save()
}

// Open a file in a new split pane by running the user's IDE command against it.
// Used by the Files tab when the user clicks a non-markdown file. Inherits the
// active pane's live cwd so relative paths inside the editor resolve correctly.
export async function splitWithIde(absPath: string): Promise<void> {
  if (!state.activeTabId || !state.activePaneId) return
  const cwd = await liveCwd(state.activePaneId)
  const newPaneId = await createPane(cwd)
  if (!placeSplit(newPaneId, 'row')) return
  focusActivePane()
  const ide = settings.commands.ide?.trim() || 'ide'
  // Single-quote the path so paths with spaces still work; escape embedded quotes.
  const quoted = `'${absPath.replace(/'/g, `'\\''`)}'`
  setTimeout(() => terminalService.input(newPaneId, `${ide} ${quoted}\r`), 350)
}

// Cmd+Shift+D: split the active pane and auto-run Claude in the new pane.
export async function splitActivePaneWithClaude(): Promise<void> {
  if (!state.activeTabId || !state.activePaneId) return
  const newPaneId = await createPane(await liveCwd(state.activePaneId))
  const p = panes.get(newPaneId)
  if (p) p.claude = true
  // Deterministic --session-id so this split maps to its own session (see
  // withClaudeSessionId), independent of PATH/alias/.zshrc.
  const command = withClaudeSessionId('claude', newPaneId)
  if (placeSplit(newPaneId, 'row')) {
    focusActivePane()
    setTimeout(() => terminalService.input(newPaneId, command + '\r'), 350)
  }
}

// Splits the active pane and drops `leafId` (a terminal or browser pane) beside it.
function placeSplit(leafId: string, dir: Dir): boolean {
  const tab = state.activeTabId ? findTab(state.tree, state.activeTabId) : null
  if (!tab || !state.activePaneId) return false
  tab.root = splitInLayout(tab.root, state.activePaneId, leafId, dir)
  state.activePaneId = leafId
  renderContent()
  updateActive()
  persistence.save()
  return true
}


// A terminal link/path was clicked:
//   • http(s) URL        → embedded browser split pane
//   • .md/.mdx/.mdc file → built-in markdown viewer (in-app doc pane)
//   • code file          → `ide <path>` in a new split terminal
// Prompt for a URL (e.g. a GitHub PR) and open it in an embedded browser pane.
export async function openUrlInBrowser(): Promise<void> {
  const url = await promptText({
    title: 'Open in browser',
    label: 'URL (e.g. a GitHub PR)',
    placeholder: 'https://github.com/owner/repo/pull/123',
    confirmText: 'Open'
  })
  if (!url) return
  let target = url.trim()
  if (target && !/^https?:\/\//i.test(target)) target = 'https://' + target
  if (target) placeSplit(createBrowserPane(target), 'row')
}

export async function openLink(target: string): Promise<void> {
  if (/^https?:\/\//i.test(target)) {
    placeSplit(createBrowserPane(target), 'row')
    return
  }
  if (/\.(?:mdx|mdc|md)$/i.test(target)) {
    // Resolve against the active cwd and its ancestors so a relative path that
    // already contains the project folder name (e.g. "pkg/docs/x.md" while cwd
    // is inside "pkg") still finds the file instead of opening a blank pane.
    const abs = await fsService.resolveFile(activeCwd() ?? '', target)
    if (abs) openMarkdownFile(abs)
    else await promptConfirm({ title: 'File not found', message: target, confirmText: 'OK' })
    return
  }
  await runInSplit(`${settings.commands.ide} ${shellQuote(target)}`)
}

// Open a fresh terminal tab rooted at `dir` (used by the Cmd+P folder picker).
export async function openTerminalInDir(dir: string): Promise<void> {
  const name = dir.replace(/\/+$/, '').split('/').pop() || 'zsh'
  await createTab(null, { title: name, cwd: dir })
}

// Open a new terminal tab and run a command (e.g. the editable openMyZsh).
export async function openTerminalRunning(command: string, title: string): Promise<void> {
  await createTab(null, { title, command })
}

// Open a new terminal at a specific directory and run a command there, without
// creating/attaching a sidebar project node (unlike openProject).
export async function runInDir(dir: string, command: string, title: string): Promise<void> {
  await createTab(null, { title, cwd: dir, command })
}

// Open a new terminal nested under a sidebar folder (e.g. a worktree folder), at
// `dir`, optionally running a command. Used by the worktree manager so terminals
// land inside the right worktree node rather than the ungrouped area.
export async function runInFolder(
  parentFolderId: string,
  dir: string,
  command: string | undefined,
  title: string
): Promise<void> {
  await createTab(parentFolderId, { title, cwd: dir, command })
}

// Resume a stored Claude conversation in a new terminal at its project cwd.
export async function resumeClaudeSession(
  sessionId: string,
  cwd: string | null,
  title: string
): Promise<void> {
  await createTab(null, {
    title,
    cwd: cwd ?? undefined,
    command: `claude --resume ${sessionId}`,
    claude: true
  })
  // record the exact session on the new pane so a later app-restore resumes it too
  const p = state.activePaneId ? panes.get(state.activePaneId) : null
  if (p) {
    p.claudeSessionId = sessionId
    // we know the id, so lock it; the periodic refresh must not overwrite it
    // with whatever's newest in this cwd (the bug we're fixing)
    p.claudeSessionLocked = true
    persistence.save()
  }
}

// Host a doc pane in a brand-new tab (its own page).
function hostDocInNewTab(id: string, title: string): void {
  const tab: TabNode = {
    kind: 'tab',
    id: uid('t'),
    title,
    titleLocked: true,
    color: null,
    pinned: false,
    root: { type: 'leaf', paneId: id }
  }
  state.tree.push(tab)
  state.activeTabId = tab.id
  state.activePaneId = id
  requestSidebar()
  renderContent()
}

// Host a doc pane: split the active pane, or create a tab if there's none.
function hostDoc(id: string, title: string): void {
  if (state.activeTabId && state.activePaneId) {
    placeSplit(id, 'row')
    return
  }
  hostDocInNewTab(id, title)
}

// Open a notebook markdown note (editable) in a split doc pane.
export function openNote(relPath: string): void {
  hostDoc(createDocPane(relPath), relPath.split('/').pop() || 'note')
}

// Open a SQL query pane next to the active pane (or in a fresh tab if none).
export function openSqlInSplit(opts: {
  connId?: string | null
  sql?: string
  fileName?: string | null
  autoRun?: boolean
} = {}): void {
  const id = createSqlPane(opts)
  hostDoc(id, 'SQL')
}

// Cmd+D in Database sidebar mode: opens an empty SQL pane.
export function splitActiveWithSql(): void {
  openSqlInSplit({})
}

// Open any markdown file on disk (read-only) — used by the Cmd+O finder.
export function openMarkdownFile(absPath: string): void {
  hostDoc(createDocPane(absPath, { absolute: true }), absPath.split('/').pop() || 'note')
}

// Open a markdown file as a NEW TAB in the same group (sibling list) as an
// originating terminal pane — used to auto-surface a freshly created plan so the
// user can review it. Falls back to a top-level tab when the origin is gone.
export function openMarkdownInGroup(originPaneId: string, absPath: string): void {
  const docId = createDocPane(absPath, { absolute: true })
  const tab: TabNode = {
    kind: 'tab',
    id: uid('t'),
    title: absPath.split('/').pop() || 'plan',
    titleLocked: true,
    color: null,
    pinned: false,
    root: { type: 'leaf', paneId: docId }
  }
  const originTab = findTabByPane(state.tree, originPaneId)
  const loc = originTab ? findById(state.tree, originTab.id) : null
  if (loc) loc.parent.splice(loc.index + 1, 0, tab)
  else state.tree.push(tab)
  state.activeTabId = tab.id
  state.activePaneId = docId
  requestSidebar()
  renderContent()
}

// Open a PR's diff as an in-app pane. Captures the active terminal first so the
// selection-send target survives the diff pane stealing focus on open.
export function openPrDiff(cwd: string, prNumber: number, title: string): void {
  const targetPaneId =
    state.activePaneId && panes.has(state.activePaneId) ? state.activePaneId : null
  hostDoc(createDiffPane({ cwd, prNumber, title, targetPaneId }), `${title} diff`)
}

// Open a file (read-only) in a line-selectable viewer pane. Captures the active
// terminal first so the selection-send target survives the new pane stealing
// focus on open.
export function openFileViewer(absPath: string): void {
  const targetPaneId =
    state.activePaneId && panes.has(state.activePaneId) ? state.activePaneId : null
  hostDoc(createFilePane({ path: absPath, targetPaneId }), absPath.split('/').pop() || 'file')
}

// First real terminal pane inside a tab's layout (skips doc/code/sql/etc panes).
function terminalPaneOf(tab: TabNode): string | null {
  for (const pid of panesInLayout(tab.root)) if (panes.has(pid)) return pid
  return null
}

// First existing code editor pane inside a tab's layout.
function codePaneOf(tab: TabNode): string | null {
  for (const pid of panesInLayout(tab.root)) if (codePanes.has(pid)) return pid
  return null
}

// Open a file in the editable Monaco code editor pane (syntax highlight +
// Cmd+S save). Used by the Files tree. Behavior, anchored on the sidebar's
// active terminal tab (not whatever pane currently holds focus):
//   • newPage → always host the editor in a brand-new tab.
//   • reuse   → if the active tab already has a code editor, load the file there.
//   • else    → split a new editor beside that tab's terminal pane.
export function openCodeEditor(
  absPath: string,
  opts: { newPage?: boolean; line?: number } = {}
): void {
  const tab = state.activeTabId ? findTab(state.tree, state.activeTabId) : null
  if (opts.newPage || !tab) {
    hostDocInNewTab(
      createCodePane({ path: absPath, line: opts.line }),
      absPath.split('/').pop() || 'file'
    )
    return
  }
  const existing = codePaneOf(tab)
  if (existing) {
    codePanes.get(existing)?.openFile(absPath, opts.line)
    selectPane(existing)
    return
  }
  // Anchor the split on the tab's terminal so repeated clicks stay predictable.
  const term = terminalPaneOf(tab)
  if (term) state.activePaneId = term
  hostDoc(createCodePane({ path: absPath, line: opts.line }), absPath.split('/').pop() || 'file')
}

// Run a one-off command in a new split terminal beside the active pane.
export async function runInSplit(command: string): Promise<void> {
  const paneId = await createPane(activeCwd())
  if (placeSplit(paneId, 'row')) {
    focusActivePane()
    setTimeout(() => terminalService.input(paneId, command + '\r'), 350)
  }
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

// Close a pane, but confirm first if it's running a process (user-initiated).
export async function confirmAndClosePane(paneId: string): Promise<void> {
  const p = panes.get(paneId)
  if (p && paneStatus(p) === 'running') {
    const ok = await promptConfirm({
      title: 'Close terminal?',
      message: 'A process is still running in this terminal. Close anyway?',
      confirmText: 'Close'
    })
    if (!ok) return
  }
  // Gather close-time actions: an unfinished daily task to mark done (todo50),
  // and a git worktree this terminal lives in to remove. When either applies,
  // show a single modal with switches (both ON by default) rather than closing
  // silently — the user can flip a switch off to skip that action.
  const task = p?.dailyTaskId
    ? dailyTaskRepo.getAll().find((t) => t.id === p.dailyTaskId && t.status !== 'done')
    : undefined
  const wt = p?.cwd ? worktreeForCwd(p.cwd) : null

  if (task || wt) {
    const res = await promptCloseActions({
      title: 'Close terminal?',
      confirmText: 'Close',
      task: task ? { issueKey: task.issueKey, title: task.title } : undefined,
      worktree: wt ? { branch: wt.node.branch, path: wt.path } : undefined
    })
    if (!res) return // cancelled — keep the terminal open
    if (task && res.markDone) {
      task.status = 'done'
      task.updatedAt = Date.now()
      persistence.save()
    }
    if (wt && res.deleteWorktree) {
      const removed = await removeWorktree(wt.project, wt.path, { force: true, skipConfirm: true })
      // On success archiveWorktreeNode already tore down this pane (and any
      // siblings under the worktree); nothing left to close.
      if (removed) return
    }
  }

  closePane(paneId)
}

// Move a terminal pane into its own window. The leaf stays in the layout tree
// (shown as a placeholder) so it re-docks on restart; the live xterm lives in
// the pop-out window, which adopts the same PTY. Pop-out only supports plain
// terminal panes (not browser/doc panes).
export function popOutPane(paneId: string): void {
  if (!panes.has(paneId) || poppedOut.has(paneId)) return
  const p = panes.get(paneId)!
  poppedOut.add(paneId)
  void terminalService.popoutOpen(paneId, p.title || 'Terminal')
  renderContent()
}

// The pop-out window confirmed its close: drop the placeholder and kill the pane.
export function killPoppedPane(paneId: string): void {
  if (!poppedOut.has(paneId)) return
  poppedOut.delete(paneId)
  closePane(paneId)
}

// Archive a terminal session (never delete): preserve its layout — with stableIds
// and bindings — in dormantRoot for later reactivation, kill its PTYs, and leave
// the node in the tree with status 'archived' (hidden from the sidebar). The live
// root becomes an empty placeholder until the session is reactivated.
export function archiveTab(tab: TabNode): void {
  tab.dormantRoot = persistence.serializeLayout(tab.root)
  panesInLayout(tab.root).forEach((id) => {
    destroyPane(id)
    terminalService.kill(id)
  })
  tab.root = { type: 'leaf', paneId: '' }
  tab.status = 'archived'
}

export function closePane(paneId: string): void {
  poppedOut.delete(paneId)

  // A background-process VIEW: tear down only the view (xterm/DOM). The PTY keeps
  // running in main (close ≠ kill); reopening re-attaches and replays the buffer.
  const viewPane = panes.get(paneId)
  if (viewPane?.isProcessView) {
    destroyPane(paneId)
    const t = allTabs(state.tree).find((tt) => layoutContains(tt.root, paneId))
    if (t) {
      const nr = removePaneFromLayout(t.root, paneId)
      if (nr === null) removeNodeById(t.id)
      else t.root = nr
    }
    fixActiveAfterChange()
    requestSidebar()
    renderContent()
    focusActivePane()
    persistence.save()
    return
  }

  // A terminal session's last pane: archive the whole session instead of
  // destroying it, so its stableId/tickets/claude bindings survive (recoverable
  // under "Show archived items"). Capture the layout before tearing the pane down.
  const isTerminalPane =
    !browsers.has(paneId) &&
    !docs.has(paneId) &&
    !sqlPanes.has(paneId) &&
    !diffPanes.has(paneId) &&
    !filePanes.has(paneId) &&
    !codePanes.has(paneId)
  const owningTab = allTabs(state.tree).find((t) => layoutContains(t.root, paneId))
  if (isTerminalPane && owningTab && panesInLayout(owningTab.root).length <= 1) {
    archiveTab(owningTab)
    fixActiveAfterChange()
    requestSidebar()
    renderContent()
    focusActivePane()
    persistence.save()
    return
  }

  if (browsers.has(paneId)) {
    destroyBrowserPane(paneId)
  } else if (docs.has(paneId)) {
    destroyDocPane(paneId)
  } else if (sqlPanes.has(paneId)) {
    destroySqlPane(paneId)
  } else if (diffPanes.has(paneId)) {
    destroyDiffPane(paneId)
  } else if (filePanes.has(paneId)) {
    destroyFilePane(paneId)
  } else if (codePanes.has(paneId)) {
    destroyCodePane(paneId)
  } else {
    destroyPane(paneId)
    terminalService.kill(paneId)
  }

  const tab = owningTab
  if (tab) {
    const newRoot = removePaneFromLayout(tab.root, paneId)
    if (newRoot === null) {
      removeNodeById(tab.id) // last (non-terminal) pane closed -> drop the tab
    } else {
      tab.root = newRoot
    }
  }
  fixActiveAfterChange()
  requestSidebar()
  renderContent()
  focusActivePane()
  persistence.save()
}

export function closeTab(tabId: string): void {
  const tab = findTab(state.tree, tabId)
  if (!tab) return
  // Archive (never delete) — keep the session recoverable.
  archiveTab(tab)
  fixActiveAfterChange()
  requestSidebar()
  renderContent()
  focusActivePane()
  persistence.save()
}

export function deleteFolder(folderId: string): void {
  const r = findById(state.tree, folderId)
  if (!r || r.node.kind !== 'folder') return
  // move children up into the folder's parent, then remove the (now empty) folder
  r.parent.splice(r.index, 1, ...r.node.children)
  fixActiveAfterChange()
  requestSidebar()
  persistence.save()
}

function removeNodeById(id: string): void {
  const r = findById(state.tree, id)
  if (r) r.parent.splice(r.index, 1)
}

function fixActiveAfterChange(): void {
  if (state.selectedNodeId && !findById(state.tree, state.selectedNodeId)) state.selectedNodeId = null
  const active = state.activeTabId ? findTab(state.tree, state.activeTabId) : null
  if (active && active.status !== 'archived') return
  const first = allTabs(state.tree).find((t) => t.status !== 'archived') ?? null
  state.activeTabId = first?.id ?? null
  state.activePaneId = first ? firstPaneOf(first.root) : null
}

// ---- Selection ----

export function selectTab(tabId: string): void {
  const tab = findTab(state.tree, tabId)
  if (!tab) return
  state.activeTabId = tabId
  state.selectedNodeId = tabId
  state.activePaneId = firstPaneOf(tab.root)
  renderContent()
  updateActive()
  focusActivePane()
}

// Mark a node (e.g. a folder) as the selection context without activating it.
export function selectNode(id: string): void {
  state.selectedNodeId = id
  updateActive()
}

export function selectPane(paneId: string): void {
  state.activePaneId = paneId
  const p = panes.get(paneId)
  if (p) p.attention = false
  const tab = allTabs(state.tree).find((t) => layoutContains(t.root, paneId))
  let tabChanged = false
  if (tab) {
    tabChanged = state.activeTabId !== tab.id
    state.activeTabId = tab.id
    state.selectedNodeId = tab.id // clicking a pane also selects its terminal in the sidebar
    // If the pane lives in a different tab (e.g. jumped to from a notification or
    // the Claude dashboard), switch the visible content to that tab.
    if (tabChanged) renderContent()
  }
  updateActive()
  updatePaneActive() // move the active-pane border so focus is visible
  requestStatuses()
  p?.term.focus()
  sqlPanes.get(paneId)?.focus()
  codePanes.get(paneId)?.focus()
  // A tab switch flips `display` on the container; xterm's textarea may not
  // accept focus until layout settles. Re-focus on the next frame so jumping
  // from a notification (or the Claude dashboard) actually lands on the pane.
  if (tabChanged && p) requestAnimationFrame(() => p.term.focus())
}

export function switchTabByIndex(index: number): void {
  const tab = allTabs(state.tree)[index]
  if (tab) selectTab(tab.id)
}

// Distribute every split in the active tab evenly. Splits get nested on every
// split-right/split-down (see splitInLayout), so a 3-pane row layout is really
// a row containing a row — setting every split to [1,1] would leave the outer
// pane at 50% and the inner two at 25% each. Merge consecutive same-direction
// splits first so all sibling panes in one direction share one parent and end
// up truly equal-sized; mixed-direction sub-areas keep their structure and
// equalize within themselves.
export function equalizePanes(): void {
  const tab = state.activeTabId ? findTab(state.tree, state.activeTabId) : null
  if (!tab) return
  tab.root = flattenSameDirSplits(tab.root)
  equalizeNode(tab.root)
  renderContent()
  persistence.save()
}

function flattenSameDirSplits(node: LayoutNode): LayoutNode {
  if (node.type === 'leaf') return node
  const flattened = node.children.map(flattenSameDirSplits)
  const merged: LayoutNode[] = []
  for (const child of flattened) {
    if (child.type === 'split' && child.dir === node.dir) merged.push(...child.children)
    else merged.push(child)
  }
  if (merged.length === 1) return merged[0]
  return { type: 'split', dir: node.dir, sizes: merged.map(() => 1), children: merged }
}

function equalizeNode(node: LayoutNode): void {
  if (node.type === 'split') {
    node.sizes = node.children.map(() => 1)
    node.children.forEach(equalizeNode)
  }
}

// Markdown doc pane font (Cmd +/- when a doc pane is focused).
export function adjustDocFontSize(delta: number): void {
  settings.docFontSize = Math.max(10, Math.min(28, settings.docFontSize + delta))
  applyDocFont()
  persistence.save()
}

export function resetDocFontSize(): void {
  settings.docFontSize = 15
  applyDocFont()
  persistence.save()
}

// Cmd+Option+Arrow: move focus to the neighbouring pane in a given direction.
// At the edge it bridges to/from the sidebar (toward where the sidebar sits).
export function focusPaneInDirection(dir: 'left' | 'right' | 'up' | 'down'): void {
  const enterDir = settings.sidebar.orientation === 'left' ? 'right' : 'down'
  const backDir = settings.sidebar.orientation === 'left' ? 'left' : 'up'

  if (sidebarFocused()) {
    if (dir === enterDir) enterContentFromSidebar()
    return
  }

  const target = paneInDirection(dir)
  if (target) selectPane(target)
  else if (dir === backDir) focusSidebar() // no pane that way -> step into the sidebar
}

function sidebarFocused(): boolean {
  const sb = document.getElementById('sidebar')
  return !!sb && sb.contains(document.activeElement)
}

function focusSidebar(): void {
  document.getElementById('tab-list')?.focus()
}

function enterContentFromSidebar(): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>('#content .pane-box'))
  if (!els.length) return
  const active = els.find((e) => e.dataset.paneId === state.activePaneId)
  // resume the active pane, otherwise the one nearest the sidebar
  const target =
    active ??
    els.reduce((a, b) => (b.getBoundingClientRect().left < a.getBoundingClientRect().left ? b : a))
  if (target.dataset.paneId) selectPane(target.dataset.paneId)
}

// The pane adjacent to the active one in `dir`, chosen from on-screen rects.
function paneInDirection(dir: 'left' | 'right' | 'up' | 'down'): string | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>('#content .pane-box'))
  const active = els.find((e) => e.dataset.paneId === state.activePaneId)
  if (!active) return null
  const ar = active.getBoundingClientRect()
  const ax = ar.left + ar.width / 2
  const ay = ar.top + ar.height / 2

  let best: { id: string; score: number } | null = null
  for (const el of els) {
    if (el === active || !el.dataset.paneId) continue
    const r = el.getBoundingClientRect()
    const dx = r.left + r.width / 2 - ax
    const dy = r.top + r.height / 2 - ay
    let ok: boolean
    let primary: number
    let secondary: number
    if (dir === 'left') {
      ok = dx < -1
      primary = -dx
      secondary = Math.abs(dy)
    } else if (dir === 'right') {
      ok = dx > 1
      primary = dx
      secondary = Math.abs(dy)
    } else if (dir === 'up') {
      ok = dy < -1
      primary = -dy
      secondary = Math.abs(dx)
    } else {
      ok = dy > 1
      primary = dy
      secondary = Math.abs(dx)
    }
    if (!ok) continue
    const score = primary + secondary * 2 // prefer aligned and close
    if (!best || score < best.score) best = { id: el.dataset.paneId, score }
  }
  return best?.id ?? null
}

// Pane menu → "Create worktree": runs the user's `run-create-worktree` shell
// function in a new split terminal opened in this pane's directory.
export async function createWorktreeFromPane(paneId: string): Promise<void> {
  const cwd = panes.get(paneId)?.cwd ?? undefined
  const form = await promptForm({
    title: 'Create worktree',
    fields: [
      { key: 'name', label: 'Name', placeholder: 'feature-x' },
      { key: 'base', label: 'Base branch', value: 'main' }
    ],
    confirmText: 'Create'
  })
  if (!form) return

  // make the source pane active so the split lands next to it
  state.activePaneId = paneId
  const owner = allTabs(state.tree).find((t) => layoutContains(t.root, paneId))
  if (owner) state.activeTabId = owner.id

  const newPaneId = await createPane(cwd)
  if (placeSplit(newPaneId, 'row')) {
    focusActivePane()
    const base = form.base || 'main'
    setTimeout(
      () => terminalService.input(newPaneId, `run-create-worktree ${shellQuote(form.name)} ${shellQuote(base)}\r`),
      350
    )
  }
}

// Git quick-actions from the pane ⋯ menu. Each runs in a fresh split beside the
// source pane (same cwd) so the original terminal/process is left untouched.
export type GitAction = 'pull' | 'commitPush' | 'commitPushPr' | 'stash' | 'branchPr'

export async function gitActionFromPane(paneId: string, action: GitAction): Promise<void> {
  if (!panes.has(paneId)) return
  let command: string
  if (action === 'pull') {
    command = 'git pull'
  } else if (action === 'branchPr') {
    const form = await promptForm({
      title: 'New branch & PR',
      fields: [
        { key: 'branch', label: 'New branch name', placeholder: 'feat/empty-state' },
        { key: 'message', label: 'Commit message', placeholder: 'feat: handle empty state' }
      ],
      confirmText: 'Create branch + PR'
    })
    if (!form) return
    const branch = form.branch.trim()
    const message = form.message.trim()
    if (!branch || !message) return
    // If not already on main, offer to branch off a freshly pulled main.
    const cur = panes.get(paneId)?.branch
    let prefix = ''
    if (cur && cur !== 'main') {
      const fromMain = await promptConfirm({
        title: 'Branch off main?',
        message: `Currently on "${cur}". Switch to main and fetch + pull before creating "${branch}"?`,
        confirmText: 'Yes, from main'
      })
      if (fromMain) prefix = 'git checkout main && git fetch && git pull && '
    }
    command =
      `${prefix}git checkout -b ${shellQuote(branch)} && git add -A && ` +
      `git commit -m ${shellQuote(message)} && git push -u origin HEAD && gh pr create --fill`
  } else if (action === 'stash') {
    const name = await promptText({
      title: 'Stash changes',
      label: 'Stash name (optional)',
      placeholder: 'e.g. wip: refactor auth',
      confirmText: 'Stash'
    })
    if (name === null) return // cancelled
    const trimmed = name.trim()
    command = trimmed ? `git stash push -m ${shellQuote(trimmed)}` : 'git stash push'
  } else {
    const msg = await promptText({
      title: action === 'commitPushPr' ? 'Commit, push & create PR' : 'Commit & push',
      label: 'Commit message',
      placeholder: 'e.g. fix: handle empty state',
      confirmText: action === 'commitPushPr' ? 'Commit + push + PR' : 'Commit + push'
    })
    if (!msg) return
    const commit = `git add -A && git commit -m ${shellQuote(msg)} && git push -u origin HEAD`
    // --fill reuses the commit subject/body for the PR; gh must be authenticated.
    command = action === 'commitPushPr' ? `${commit} && gh pr create --fill` : commit
  }

  // Run in the pane's OWN terminal (no new split): focus it and type the command.
  selectPane(paneId)
  terminalService.input(paneId, command + '\r')
}

export function cyclePane(dir: number): void {
  const tab = state.activeTabId ? findTab(state.tree, state.activeTabId) : null
  if (!tab) return
  const list = panesInLayout(tab.root)
  if (!list.length) return
  const idx = state.activePaneId ? list.indexOf(state.activePaneId) : -1
  selectPane(list[(idx + dir + list.length) % list.length])
}

// ---- Node editing (rename / color / pin / collapse) ----

export function setNodeName(id: string, name: string): void {
  const r = findById(state.tree, id)
  if (!r) return
  const v = name.trim()
  if (!v) return
  if (r.node.kind === 'tab') {
    r.node.title = v
    r.node.titleLocked = true
  } else {
    r.node.name = v
  }
  requestSidebar()
  persistence.save()
}

export function autoNameTab(tabId: string): void {
  const tab = findTab(state.tree, tabId)
  if (!tab) return
  tab.titleLocked = false
  const p = panes.get(firstPaneOf(tab.root) ?? '')
  if (p?.title) tab.title = p.title
  requestSidebar()
  persistence.save()
}

export function setNodeColor(id: string, color: string | null): void {
  const r = findById(state.tree, id)
  if (!r) return
  r.node.color = color
  requestSidebar()
  persistence.save()
}

export function togglePin(id: string): void {
  const r = findById(state.tree, id)
  if (!r) return
  r.node.pinned = !r.node.pinned
  requestSidebar()
  persistence.save()
}

export function toggleCollapse(folderId: string): void {
  const r = findById(state.tree, folderId)
  if (r && isContainer(r.node)) {
    r.node.collapsed = !r.node.collapsed
    requestSidebar()
    persistence.save()
  }
}

// Recursively expand (collapsed=false) or collapse (collapsed=true) every
// container (folder or project) in the sidebar tree. Backs the expand/
// collapse-all toolbar button.
export function setAllFoldersCollapsed(collapsed: boolean): void {
  const walk = (nodes: SidebarNode[]): void => {
    for (const node of nodes) {
      if (isContainer(node)) {
        node.collapsed = collapsed
        walk(node.children)
      }
    }
  }
  walk(state.tree)
  requestSidebar()
  persistence.save()
}

// True when at least one container in the tree is currently expanded.
export function anyFolderExpanded(): boolean {
  const walk = (nodes: SidebarNode[]): boolean => {
    for (const node of nodes) {
      if (isContainer(node)) {
        if (!node.collapsed) return true
        if (walk(node.children)) return true
      }
    }
    return false
  }
  return walk(state.tree)
}

// Expand/collapse a terminal row's detail line (collapsed = title only, thin).
export function toggleTabDetails(tabId: string): void {
  const r = findById(state.tree, tabId)
  if (r && r.node.kind === 'tab') {
    r.node.detailsOpen = !r.node.detailsOpen
    requestSidebar()
    persistence.save()
  }
}

// ---- Drag & drop move ----

export type DropMode = 'before' | 'after' | 'into'

export function moveNode(dragId: string, targetId: string | null, mode: DropMode): void {
  const src = findById(state.tree, dragId)
  if (!src) return

  // Resolve destination list + index
  let destList: SidebarNode[]
  let destIndex: number

  if (targetId === null) {
    destList = state.tree
    destIndex = state.tree.length
  } else {
    if (targetId === dragId) return
    const tgt = findById(state.tree, targetId)
    if (!tgt) return
    // can't drop a folder into its own subtree
    if (isContainer(src.node) && isDescendant(src.node, targetId)) return

    if (mode === 'into') {
      if (!isContainer(tgt.node)) return
      if (!depthOk(src.node, tgt.node.id)) {
        flash(`Max folder depth is ${MAX_FOLDER_DEPTH}`)
        return
      }
      tgt.node.collapsed = false // reveal where the item landed
      destList = tgt.node.children
      destIndex = tgt.node.children.length
    } else {
      // parent of the target = the list it lives in
      const parentFolderDepth = parentDepthOfList(tgt.parent)
      if (src.node.kind === 'folder' && parentFolderDepth + subtreeFolderDepth(src.node) > MAX_FOLDER_DEPTH) {
        flash(`Max folder depth is ${MAX_FOLDER_DEPTH}`)
        return
      }
      destList = tgt.parent
      destIndex = tgt.index + (mode === 'after' ? 1 : 0)
    }
  }

  // Remove from old location (adjust index if same list, earlier position)
  const fresh = findById(state.tree, dragId)
  if (!fresh) return
  if (fresh.parent === destList && fresh.index < destIndex) destIndex--
  fresh.parent.splice(fresh.index, 1)
  destList.splice(destIndex, 0, fresh.node)

  requestSidebar()
  persistence.save()
}

// depth check for dropping `node` INTO folder with id
function depthOk(node: SidebarNode, folderId: string): boolean {
  const base = depthOfFolder(state.tree, folderId) // 1-based
  if (node.kind === 'tab') return base + 1 <= MAX_FOLDER_DEPTH + 1 // tabs always fine
  return base + subtreeFolderDepth(node) <= MAX_FOLDER_DEPTH
}

// folder depth of the folder that owns `list` (0 if list is the root)
function parentDepthOfList(list: SidebarNode[]): number {
  if (list === state.tree) return 0
  const owner = allFolders(state.tree).find((f) => f.children === list)
  return owner ? depthOfFolder(state.tree, owner.id) : 0
}

function allFolders(tree: SidebarNode[], acc: FolderNode[] = []): FolderNode[] {
  for (const n of tree) {
    if (n.kind === 'folder') {
      acc.push(n)
      allFolders(n.children, acc)
    }
  }
  return acc
}

// ---- tiny transient toast ----

let flashTimer: number | null = null
function flash(msg: string): void {
  let el = document.getElementById('toast')
  if (!el) {
    el = (<div id="toast" />) as HTMLDivElement
    document.body.appendChild(el)
  }
  el.textContent = msg
  el.classList.add('show')
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => el?.classList.remove('show'), 1800)
}

export { settings }
