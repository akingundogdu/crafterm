import '@xterm/xterm/css/xterm.css'
import '@ui/styles/tokens.css'
import '@ui/components/modal/modal.css'
import './global.css'
import './app-shell.css'
import type { LayoutNode, SidebarNode, DiffPane, CodePane } from './types'
import type { SavedNode, SavedSidebarNode } from '@bridge/api'
import {
  state,
  panes,
  docs,
  diffPanes,
  codePanes,
  hooks,
  paneActions,
  uid,
  applyBgColor,
  applyDocFont,
  settings
} from './state'
import { persistence } from '@services/storage/persistence.service'
import { loadSettings, migrateLegacyState, seedActionMenu } from '@services/storage/settings.service'
import { actionMenuRepo } from '@services/storage/repositories'
import { firstPaneOf, allTabs, findById } from './tree'
import { flattenProjects } from './catalog'
import {
  createPane,
  markBusy,
  refreshPaneInfo,
  applyClaudeSessionTitle,
  refreshPanePlans,
  refreshClaudeStatus,
  setPaneBackground,
  adjustActivePaneFontSize,
  resetActivePaneFontSize,
  refreshPaneDailyTask
} from './pane'
import { createSqlPane } from './screens/db-pane/db-pane'
import { createCodePane } from './screens/code-pane/code-pane'
import { setEditorOpenHandler } from './editor/code-editor'
import { applyTheme } from './editor/monaco-setup'
import { renderContent, updatePaneHighlight } from './screens/content/content'
import { initNotifications, renderNotifications, toggleNotifPanel } from './screens/notifications/notifications'
import { openTrackModal } from './screens/time/time'
import {
  renderSidebar,
  updateStatuses,
  updateActiveTab,
  applyOrientation,
  wireSidebarResizer,
  focusSearch,
  applySidebarFont,
  adjustSidebarFontSize,
  resetSidebarFontSize,
  sidebarHasFocus,
  applySidebarCollapsed,
  toggleSidebar,
  isNotebookMode,
  isDatabaseMode,
  setSidebarMode,
  applyTabDisplay,
  renameSelected
} from './screens/sidebar/sidebar'
import { notebookNewNote, notebookNewFolder, notebookRenameSelected, notebookLinkFile, notebookSubTab } from './notebook'
import {
  openNewDailyTask,
  showDailyPlanModal,
  assignPaneToTask,
  dailyTaskLabel,
  dailyTaskIssueKey,
  dailyTaskStatus,
  viewPaneTask,
  markPaneTaskDone,
  markPaneTaskReview,
  markPaneTaskTest
} from './screens/daily-plan/daily-plan'
import { openNewMeeting } from './screens/meeting-notes/meeting-notes'
import { openReminderForm } from './screens/reminders/reminders'
import { openSettings } from './screens/settings/settings'
import {
  showProjectPicker,
  showRunAppsPicker,
  showRunApp,
  showFeaturePicker
} from './screens/pickers/project/project'
import { showAllMarkdown } from './screens/pickers/finders/finders'
import { showFolderPicker } from './screens/pickers/folder/folder'
import { showCommandPalette, showTerminalSwitcher } from './screens/pickers/command/command'
import { showStashManager, showBranchCheckout } from './screens/pickers/git/git'
import { showGlobalSearch } from './screens/pickers/global-search/global-search'
import { showSpotlight } from './screens/spotlight/spotlight'
import { startWorktreeReconcile } from '@services/worktrees'
import { onProcessExit } from '@services/bgproc'
import { startIosWorktreePoll } from './screens/ios-worktree/ios-worktree'
import { showImproveModal } from './screens/improve-crafterm/improve-crafterm'
import { databaseNewProject } from './screens/database/database'
import { renderDocker } from './screens/docker/docker'
import { KEYBINDINGS, effectiveCombo, comboFromEvent, isRecording } from './keybindings'
import { terminalService, claudeService, plansService, appService, storeService } from '@services'

// New terminals: if the selected container (project or folder) has a command
// defined, open a terminal there and run it (project command runs in the
// project's path). Otherwise fall back to the project picker (when configured),
// else a plain blank terminal.
function newTerminal(parentFolderId: string | null): void {
  const container = parentFolderId ? (findById(state.tree, parentFolderId)?.node ?? null) : null
  let cmd: string | undefined
  let path: string | undefined
  if (container?.kind === 'project') {
    cmd = container.command?.trim() || container.startup?.trim() || undefined
    path = container.path
  } else if (container?.kind === 'worktree') {
    // A worktree opens its terminals at the worktree path.
    cmd = container.startup?.trim() || undefined
    path = container.worktreePath
  } else if (container?.kind === 'folder') {
    cmd = container.startup?.trim() || undefined
    if (container.worktreePath) path = container.worktreePath
  }
  if (cmd || path) {
    // createTab pulls the container's command/startup and runs it in `path`.
    void newTab(parentFolderId, path)
    return
  }
  const hasProjects = flattenProjects(state.tree).length > 0
  if (hasProjects && settings.askProjectOnNew) showProjectPicker(parentFolderId)
  else void newTab(parentFolderId)
}
import {
  newTab,
  newClaudeTab,
  newClaudeTabInContext,
  newFolder,
  newFolderInContext,
  createProject,
  splitActivePane,
  splitActivePaneWithClaude,
  splitActiveWithSql,
  splitPane,
  movePaneByDrop,
  closePane,
  confirmAndClosePane,
  popOutPane,
  killPoppedPane,
  selectPane,
  cyclePane,
  openLink,
  openUrlInBrowser,
  equalizePanes,
  adjustDocFontSize,
  resetDocFontSize,
  focusPaneInDirection,
  createWorktreeFromPane,
  gitActionFromPane,
  openMarkdownInGroup,
  openCodeEditor,
  contextFolderId
} from './commands'

// ---- Wire render hooks + pane action dispatch ----
hooks.renderSidebar = renderSidebar
hooks.updateStatuses = updateStatuses
hooks.updateActive = updateActiveTab
hooks.renderContent = renderContent
hooks.updatePaneHighlight = updatePaneHighlight
hooks.renderNotifications = renderNotifications
paneActions.select = selectPane
paneActions.close = (id) => void confirmAndClosePane(id)
paneActions.openLink = openLink
paneActions.openUrl = () => void openUrlInBrowser()
paneActions.trackTime = (id) => openTrackModal(id)
paneActions.createWorktree = createWorktreeFromPane
paneActions.split = (id, dir) => void splitPane(id, dir)
paneActions.movePane = movePaneByDrop
paneActions.popOut = popOutPane
paneActions.git = (id, action) => void gitActionFromPane(id, action)
paneActions.stashes = (id) => void showStashManager(id)
paneActions.branchCheckout = (id) => void showBranchCheckout(id)
paneActions.splitWithProject = (id) => {
  selectPane(id)
  showProjectPicker(null, { split: true })
}
paneActions.runApp = (project, app) => showRunApp(project, app)
paneActions.openPlanInGroup = (originPaneId, absPath) => openMarkdownInGroup(originPaneId, absPath)
paneActions.clarify = (paneId) => terminalService.input(paneId, '/run-clarify\r')
paneActions.assignDailyTask = (paneId) => assignPaneToTask(paneId)
paneActions.dailyTaskLabel = (taskId) => dailyTaskLabel(taskId)
paneActions.dailyTaskIssueKey = (taskId) => dailyTaskIssueKey(taskId)
paneActions.dailyTaskStatus = (taskId) => dailyTaskStatus(taskId)
paneActions.viewTicketDetail = (paneId) => viewPaneTask(paneId)
paneActions.markTaskDone = (paneId) => markPaneTaskDone(paneId)
paneActions.markTaskReview = (paneId) => markPaneTaskReview(paneId)
paneActions.markTaskTest = (paneId) => markPaneTaskTest(paneId)
paneActions.reactivateTab = (tabId) => void reactivateTab(tabId)

// ---- PTY stream wiring ----
terminalService.onData((id, data) => {
  const p = panes.get(id)
  if (!p) return
  p.term.write(data)
  // Keep a rolling ANSI-stripped tail of recent output for Claude panes only —
  // used to tell "task done" apart from "Claude is waiting on a question" when
  // the idle timer fires. Capped at a few KB to keep memory predictable.
  if (p.claude) {
    const stripped = data.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
    p.outputTail = (p.outputTail + stripped).slice(-4096)
  }
  markBusy(p)
})
// While quitting, the main process kills every PTY; ignore those exits so we
// don't tear down the tree and overwrite the saved session with an empty one.
let quitting = false
appService.onAppQuitting(() => {
  quitting = true
  persistence.flush() // flush the current (still-intact) tree before any pane closes
})
// macOS hides the traffic lights while fullscreen — reflect that on the body so
// the content-statusbar can drop its left clearance when not needed.
appService.onFullscreenChange((isFull) => {
  document.body.classList.toggle('window-fullscreen', isFull)
})
terminalService.onExit((id) => {
  if (!quitting) closePane(id)
})
// A background process finished — mark it done in its worktree's process list.
terminalService.onProcExit((id, code) => onProcessExit(id, code))
// Clicking a native notification focuses the pane that fired it.
terminalService.onFocusPane((id) => {
  if (!panes.has(id)) return
  selectPane(id)
  // A notification click fires this while the OS is still bringing the window to
  // the front, so the terminal can lose the focus selectPane just set. Re-focus
  // once the window has settled in front.
  setTimeout(() => panes.get(id)?.term.focus(), 80)
})
// A pop-out window confirmed its close: kill the pane and drop its placeholder.
terminalService.onPopoutKilled((id) => killPoppedPane(id))
// Cmd+W comes from a menu accelerator so it also works while a browser pane is focused.
terminalService.onCloseActivePane(() => {
  if (state.activePaneId) void confirmAndClosePane(state.activePaneId)
})

// ---- Footer buttons ----
document.getElementById('new-tab')!.addEventListener('click', () => newTerminal(null))
document.getElementById('new-claude')!.addEventListener('click', () => void newClaudeTab())
document.getElementById('new-folder')!.addEventListener('click', () => void newFolder())
document.getElementById('new-project')!.addEventListener('click', () => void createProject())
document.getElementById('settings-btn')!.addEventListener('click', () => openSettings())
document.getElementById('equalize-btn')!.addEventListener('click', () => equalizePanes())
document.getElementById('nb-new-note')!.addEventListener('click', () => notebookNewNote())
document.getElementById('nb-new-folder')!.addEventListener('click', () => notebookNewFolder())
document.getElementById('nb-link-file')!.addEventListener('click', () => notebookLinkFile())
document.getElementById('nb-settings-btn')!.addEventListener('click', () => openSettings())
document.getElementById('db-new-project')!.addEventListener('click', () => databaseNewProject())
document.getElementById('db-settings-btn')!.addEventListener('click', () => openSettings())
document.getElementById('docker-refresh')!.addEventListener('click', () => void renderDocker(document.getElementById('tab-list')!))
document.getElementById('docker-settings-btn')!.addEventListener('click', () => openSettings())

// Cmd +/- zoom: markdown doc when one is active, else sidebar (if focused),
// else the terminal font.
function activeIsDoc(): boolean {
  return !!state.activePaneId && docs.has(state.activePaneId)
}
function activeDiffPane(): DiffPane | null {
  return state.activePaneId ? diffPanes.get(state.activePaneId) ?? null : null
}
function activeCodePane(): CodePane | null {
  return state.activePaneId ? codePanes.get(state.activePaneId) ?? null : null
}
function zoomFont(delta: number): void {
  const cp = activeCodePane()
  const dp = activeDiffPane()
  if (cp) cp.setFont(delta)
  else if (dp) dp.setFont(delta)
  else if (activeIsDoc()) adjustDocFontSize(delta)
  else if (sidebarHasFocus()) adjustSidebarFontSize(delta)
  else adjustActivePaneFontSize(delta) // only the focused terminal, not all
}
function zoomFontReset(): void {
  const cp = activeCodePane()
  const dp = activeDiffPane()
  if (cp) cp.resetFont()
  else if (dp) dp.resetFont()
  else if (activeIsDoc()) resetDocFontSize()
  else if (sidebarHasFocus()) resetSidebarFontSize()
  else resetActivePaneFontSize()
}

// Editable shortcut actions (id -> handler); combos live in keybindings.ts.
const KEY_HANDLERS: Record<string, () => void> = {
  'new-terminal': () => newTerminal(contextFolderId()),
  'new-claude': () => void newClaudeTabInContext(),
  'open-project': () =>
    isNotebookMode() ? void showAllMarkdown() : showProjectPicker(contextFolderId()),
  'terminal-switcher': () => showTerminalSwitcher(),
  'folder-picker': () => void showFolderPicker(),
  'command-palette': () => void showCommandPalette(),
  'focus-search': () => focusSearch(),
  'toggle-sidebar': () => toggleSidebar(),
  'new-folder': () => void newFolderInContext(),
  'split-right': () => {
    // Cmd+D is context-aware: in the Database sidebar mode it opens a SQL pane
    // (the workbench split), otherwise it splits the active terminal pane.
    if (isDatabaseMode()) splitActiveWithSql()
    else void splitActivePane('row')
  },
  'split-claude': () => void splitActivePaneWithClaude(),
  'split-picker': () => showProjectPicker(null, { split: true }),
  'global-search': () => void showGlobalSearch(),
  spotlight: () => void showSpotlight(),
  'spotlight-files': () => void showSpotlight('files'),
  'spotlight-commands': () => void showSpotlight('commands'),
  'spotlight-claude': () => void showSpotlight('claude'),
  'spotlight-terminals': () => void showSpotlight('terminals'),
  'spotlight-shortcuts': () => void showSpotlight('shortcuts'),
  'spotlight-plans': () => void showSpotlight('plans'),
  'spotlight-bookmarks': () => void showSpotlight('bookmarks'),
  'spotlight-apps': () => void showSpotlight('apps'),
  'spotlight-tasks': () => void showSpotlight('tasks'),
  'spotlight-projects': () => void showSpotlight('projects'),
  'spotlight-notebooks': () => void showSpotlight('notebooks'),
  'spotlight-accounts': () => void showSpotlight('accounts'),
  'cycle-next': () => cyclePane(1),
  'cycle-prev': () => cyclePane(-1),
  equalize: () => equalizePanes(),
  settings: () => openSettings(),
  improve: () => void showImproveModal(),
  'daily-board': () => showDailyPlanModal(),
  // Context-sensitive: rename the selected item when the left sidebar holds
  // focus, otherwise (working in a terminal) open the New reminder form.
  rename: () =>
    sidebarHasFocus()
      ? isNotebookMode()
        ? notebookRenameSelected()
        : renameSelected()
      : openReminderForm(),
  'run-apps': () => showRunAppsPicker(),
  'new-feature': () => showFeaturePicker()
}

// Let the spotlight's Shortcuts tab run any editable keybinding by id without
// importing main.ts (avoids an import cycle).
hooks.runShortcut = (id) => KEY_HANDLERS[id]?.()

// True while any modal overlay (settings, improve, picker, dialog…) is mounted.
// Used by the global keydown handler to suppress shortcuts that would otherwise
// fire in the wrong context (e.g. Cmd+N in Improve dispatching notebook-new-note).
function isModalActive(): boolean {
  return !!document.querySelector('.modal-overlay')
}
// Reflect the modal state on <body> so CSS / debug tooling can target it.
const modalObserver = new MutationObserver(() => {
  document.body.dataset.scope = isModalActive() ? 'modal' : 'global'
})
modalObserver.observe(document.body, { childList: true, subtree: false })
document.body.dataset.scope = 'global'

// ---- Shortcuts (Cmd = metaKey). Capture phase so xterm doesn't eat them. ----
window.addEventListener(
  'keydown',
  (e) => {
    if (isRecording()) return // settings is capturing a new shortcut
    if (!e.metaKey) return
    // Whenever a modal is open, surrender the global shortcut grid to it. The
    // modal mounts its own keydown listener for its scoped shortcuts (Improve
    // handles Cmd+1/2/3 + Cmd+N internally); anything else would be a global
    // shortcut firing in the wrong context.
    if (isModalActive()) return
    // Notebook-mode shortcuts: Cmd+N new note, Cmd+Shift+N new folder. The
    // active sub-tab decides what Cmd+N creates (note / daily task / meeting).
    if (isNotebookMode() && !e.altKey && e.key.toLowerCase() === 'n') {
      const sub = notebookSubTab()
      if (sub === 'daily') {
        if (!e.shiftKey) openNewDailyTask()
      } else if (sub === 'meeting') {
        if (!e.shiftKey) openNewMeeting()
      } else if (e.shiftKey) {
        notebookNewFolder()
      } else {
        notebookNewNote()
      }
      e.preventDefault()
      e.stopPropagation()
      return
    }
    let handled = true
    // fixed shortcuts (not editable): panel toggles, pane nav, font zoom, row jump
    // option+cmd+←/→ toggle the side panels; ↑/↓ still move between panes.
    if (e.altKey && e.key === 'ArrowLeft') toggleSidebar()
    else if (e.altKey && e.key === 'ArrowRight') toggleNotifPanel()
    else if (e.altKey && e.key === 'ArrowUp') focusPaneInDirection('up')
    else if (e.altKey && e.key === 'ArrowDown') focusPaneInDirection('down')
    else if (!e.altKey && (e.key === '=' || e.key === '+')) zoomFont(1)
    else if (!e.altKey && (e.key === '-' || e.key === '_')) zoomFont(-1)
    else if (!e.altKey && e.key === '0') zoomFontReset()
    else if (!e.altKey && e.key === '1') setSidebarMode('terminal')
    else if (!e.altKey && e.key === '2') setSidebarMode('notebook')
    else if (!e.altKey && e.key === '3') setSidebarMode('database')
    else {
      // editable shortcuts (Settings → Shortcuts)
      const combo = comboFromEvent(e)
      const action = KEYBINDINGS.find((a) => effectiveCombo(a.id) === combo)
      if (action && KEY_HANDLERS[action.id]) KEY_HANDLERS[action.id]()
      else handled = false
    }
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  },
  true
)

// ---- Periodic cwd/git refresh ----
window.setInterval(() => {
  panes.forEach((p) => void refreshPaneInfo(p))
}, 4000)

// ---- Periodic Claude session-status refresh (sidebar status dot) ----
window.setInterval(() => {
  panes.forEach((p) => void refreshClaudeStatus(p))
}, 3000)

// A session jsonl under this cwd changed (most importantly a /rename): re-read
// the title for every Claude pane on that cwd so the sidebar reflects it
// instantly, without waiting for the 4s poll.
claudeService.onSessionsChanged((cwd) => {
  panes.forEach((p) => {
    if (p.claude && p.cwd === cwd && p.claudeSessionId && !p.titleLocked) {
      void applyClaudeSessionTitle(p)
    }
  })
})

// Live plan-file refresh: a file landed in <repo>/docs/plans → re-fetch every
// pane's plan list. Cheap (one readdir per pane in main); the periodic poll is
// the safety net while this is the responsive path.
plansService.onChanged(() => {
  panes.forEach((p) => void refreshPanePlans(p))
})

// ---- Rebuild live tree from saved state (re-spawns shells) ----
async function buildLayout(n: SavedNode): Promise<LayoutNode> {
  if (n.type === 'leaf') {
    if (n.sqlPane) {
      const sqlId = createSqlPane({
        connId: n.sqlPane.connId,
        sql: n.sqlPane.code,
        fileName: n.sqlPane.fileName,
        themeName: n.sqlPane.themeName
      })
      return { type: 'leaf', paneId: sqlId }
    }
    if (n.codePane) {
      const codeId = createCodePane({ path: n.codePane.path, themeName: n.codePane.themeName })
      return { type: 'leaf', paneId: codeId }
    }
    // cwd-aware resume: if the saved cwd was lost (e.g. wiped by a transient lsof
    // failure before an older build's hard kill) but we still have the Claude
    // session id, recover the session's real cwd from its jsonl so the pane —
    // and `claude --resume` — open in the right project directory.
    let cwd = n.cwd
    if (!cwd && n.claude && n.claudeSessionId) {
      cwd = (await claudeService.sessionCwd(n.claudeSessionId)) ?? undefined
    }
    const id = await createPane(cwd, { stableId: n.stableId })
    const p = panes.get(id)
    if (p && n.titleLocked && n.title) {
      p.title = n.title
      p.titleLocked = true
      p.htitle.textContent = n.title
    }
    if (p && n.claude) {
      p.claude = true
      p.claudeSessionId = n.claudeSessionId ?? null
      if (n.claudeSessionId) {
        // we already have the exact id from the saved state — freeze it so the
        // periodic refresh can't replace it with a newer sibling session
        p.claudeSessionLocked = true
      } else {
        // no id captured yet; baseline so future captures only adopt sessions
        // appearing after this restore (not pre-existing jsonls in the cwd)
        p.claudeSpawnedAt = Date.now()
        p.claudeSessionLocked = false
      }
      // Resume the exact session if we captured its id, else the latest in this cwd.
      const cmd = n.claudeSessionId ? `claude --resume ${n.claudeSessionId}` : 'claude --continue'
      setTimeout(() => terminalService.input(id, cmd + '\r'), 500)
    } else if (p && n.lastCommand) {
      // Raw terminal: pre-type the last command WITHOUT a trailing CR so the user
      // sees it at the prompt and decides whether to run it (never auto-execute —
      // the last command could be destructive).
      setTimeout(() => terminalService.input(id, n.lastCommand!), 600)
    }
    if (n.bgColor) setPaneBackground(id, n.bgColor)
    if (p) {
      if (n.projectId) p.projectId = n.projectId
      if (n.appId) p.appId = n.appId
      // running/waiting don't survive a restart (nothing is actually live yet) —
      // normalize to idle; archived/done persist as-is.
      if (n.status) p.status = n.status === 'running' || n.status === 'waiting' ? 'idle' : n.status
      if (n.role) p.role = n.role
      // tickets[] is canonical; fall back to the legacy single dailyTaskId.
      const ticket = n.tickets?.[0] ?? n.dailyTaskId
      if (ticket) {
        p.dailyTaskId = ticket
        refreshPaneDailyTask(id)
      }
    }
    return { type: 'leaf', paneId: id }
  }
  const children: LayoutNode[] = []
  for (const c of n.children) children.push(await buildLayout(c))
  const sizes = n.sizes && n.sizes.length === children.length ? n.sizes.slice() : children.map(() => 1)
  return { type: 'split', dir: n.dir, sizes, children }
}

// Reactivate an archived session: rebuild its dormant layout (re-spawns panes +
// PTYs, resumes Claude) and clear the archived status, making it the active tab.
async function reactivateTab(tabId: string): Promise<void> {
  const found = findById(state.tree, tabId)
  if (!found || found.node.kind !== 'tab') return
  const tab = found.node
  if (tab.status !== 'archived' || !tab.dormantRoot) return
  const root = await buildLayout(tab.dormantRoot)
  tab.root = root
  tab.dormantRoot = undefined
  tab.status = 'idle'
  state.activeTabId = tab.id
  state.activePaneId = firstPaneOf(root)
  renderSidebar()
  renderContent()
  if (state.activePaneId) panes.get(state.activePaneId)?.term.focus()
  persistence.save()
}

async function buildSidebar(nodes: SavedSidebarNode[]): Promise<SidebarNode[]> {
  const out: SidebarNode[] = []
  for (const n of nodes) {
    if (n.kind === 'tab') {
      // Archived sessions restore as dormant records — no panes/PTYs spawned
      // (decision: archived nodes don't open on restore). The preserved layout is
      // kept in dormantRoot so the session can be reactivated on demand.
      if (n.status === 'archived') {
        out.push({
          kind: 'tab',
          id: uid('t'),
          title: n.title || 'zsh',
          titleLocked: !!n.titleLocked,
          color: n.color ?? null,
          pinned: !!n.pinned,
          root: { type: 'leaf', paneId: '' },
          status: 'archived',
          dormantRoot: n.root,
          detailsOpen: !!n.detailsOpen
        })
        continue
      }
      const root = await buildLayout(n.root)
      out.push({
        kind: 'tab',
        id: uid('t'),
        title: n.title || 'zsh',
        titleLocked: !!n.titleLocked,
        color: n.color ?? null,
        pinned: !!n.pinned,
        root,
        detailsOpen: !!n.detailsOpen
      })
    } else if (n.kind === 'project') {
      const children = await buildSidebar(n.children)
      out.push({
        kind: 'project',
        // Reuse the persisted primary key so daily-task → project links survive a
        // restart; old state without an id gets a fresh one (persisted next save).
        id: n.id ?? uid('p'),
        name: n.name || 'Project',
        color: n.color ?? null,
        collapsed: !!n.collapsed,
        pinned: !!n.pinned,
        children,
        path: n.path,
        command: n.command,
        group: n.group,
        startup: n.startup,
        env: n.env,
        shell: n.shell,
        apps: n.apps ? n.apps.map((a) => ({ ...a })) : undefined,
        features: n.features ? n.features.map((f) => ({ ...f })) : undefined,
        runCommands: n.runCommands ? n.runCommands.map((c) => ({ ...c })) : undefined,
        iosApp: n.iosApp,
        iosConfig: n.iosConfig
          ? {
              project: n.iosConfig.project ?? '',
              scheme: n.iosConfig.scheme ?? '',
              baseBundleId: n.iosConfig.baseBundleId ?? '',
              displayPrefix: n.iosConfig.displayPrefix ?? '',
              defaultSimulator: n.iosConfig.defaultSimulator ?? '',
              copyFiles: [...(n.iosConfig.copyFiles ?? [])],
              worktreesDir: n.iosConfig.worktreesDir ?? ''
            }
          : undefined,
        supportWorktree: n.supportWorktree,
        issueKeyPrefix: n.issueKeyPrefix
      })
    } else if (n.kind === 'worktree' || (n.kind === 'folder' && n.worktreePath)) {
      // First-class worktree node — or migrate an old folder-with-worktreePath.
      const children = await buildSidebar(n.children)
      const branch = n.kind === 'worktree' ? n.branch : n.feature || n.name || ''
      out.push({
        kind: 'worktree',
        id: uid('w'),
        name: n.name || branch || 'worktree',
        color: n.color ?? null,
        collapsed: !!n.collapsed,
        pinned: !!n.pinned,
        children,
        group: n.group,
        branch,
        worktreePath: n.worktreePath ?? '',
        status: n.kind === 'worktree' ? n.status ?? 'idle' : 'idle',
        processes: n.kind === 'worktree' ? n.processes?.map((p) => ({ ...p })) : undefined,
        lastRun: n.kind === 'worktree' ? n.lastRun : undefined,
        startup: n.startup,
        env: n.env,
        shell: n.shell
      })
    } else {
      const children = await buildSidebar(n.children)
      out.push({
        kind: 'folder',
        id: uid('f'),
        name: n.name || 'Folder',
        color: n.color ?? null,
        collapsed: !!n.collapsed,
        pinned: !!n.pinned,
        children,
        group: n.group,
        feature: n.feature,
        worktreeContainer: n.worktreeContainer,
        worktreePath: n.worktreePath,
        startup: n.startup,
        env: n.env,
        shell: n.shell
      })
    }
  }
  return out
}

async function init(): Promise<void> {
  // If we just relaunched after a self-update, cover the restore with an overlay.
  const wasUpdating = await appService.deployWasUpdating()
  const updateOverlay = document.getElementById('update-overlay')
  if (wasUpdating && updateOverlay) updateOverlay.hidden = false

  const saved = await storeService.load()
  if (saved) loadSettings(saved)
  if (!actionMenuRepo.getAll().length) settings.actionMenu = seedActionMenu()

  applyBgColor()
  applyDocFont()
  void applyTheme(settings.editorTheme) // global Monaco editor theme
  // Route editor go-to-definition (cross-file imports) into our pane system.
  setEditorOpenHandler((p, line) => openCodeEditor(p, { line }))
  applyOrientation()
  applySidebarFont()
  applySidebarCollapsed()
  initNotifications()
  applyTabDisplay()
  wireSidebarResizer(() => persistence.save())

  // Restore the saved session tree. Guard it so a single failure can't leave the
  // app blank — we still fall back to whatever rebuilt, or a fresh terminal.
  try {
    if (saved?.tree?.length) {
      state.tree = await buildSidebar(saved.tree)
    } else if (saved?.tabs?.length) {
      // migrate legacy flat tab list
      for (const t of saved.tabs) {
        const root = await buildLayout(t.root)
        state.tree.push({
          kind: 'tab',
          id: uid('t'),
          title: t.title || 'zsh',
          titleLocked: !!t.titleLocked,
          color: null,
          pinned: false,
          root
        })
      }
    }
  } catch (err) {
    console.error('[crafterm] session restore failed:', err)
  }

  // Fold any legacy catalog/features fields from old state files into state.tree.
  // Must run AFTER the sidebar is rebuilt so existing ProjectNodes are picked up
  // by path-based dedup.
  if (saved) migrateLegacyState(saved)

  const first = allTabs(state.tree).find((t) => t.status !== 'archived')
  if (first) {
    state.activeTabId = first.id
    state.activePaneId = firstPaneOf(first.root)
    renderSidebar()
    renderContent()
    if (state.activePaneId) panes.get(state.activePaneId)?.term.focus()
    persistence.save()
  } else {
    await newTab()
  }

  // Worktree manager: materialize git worktrees into sidebar nodes (generic) and
  // start the iOS build-status poll.
  startWorktreeReconcile()
  startIosWorktreePoll()

  // Update finished: flip the overlay to a brief confirmation, then dismiss.
  if (wasUpdating && updateOverlay) {
    const sub = updateOverlay.querySelector<HTMLElement>('.update-overlay-sub')
    const text = updateOverlay.querySelector<HTMLElement>('.update-overlay-text')
    updateOverlay.querySelector<HTMLElement>('.update-spinner')?.remove()
    if (text) text.textContent = 'Updated ✓'
    if (sub) sub.textContent = 'Sessions restored'
    setTimeout(() => {
      updateOverlay.classList.add('fade-out')
      setTimeout(() => (updateOverlay.hidden = true), 400)
    }, 900)
  }
}

void init()
