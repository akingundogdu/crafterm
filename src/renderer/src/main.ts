import '@xterm/xterm/css/xterm.css'
import './style.css'
import type { LayoutNode, SidebarNode } from './types'
import type { SavedNode, SavedSidebarNode } from '../../preload/api'
import { state, panes, docs, hooks, paneActions, loadSettings, saveSoon, persistNow, uid, applyBgColor, applyDocFont, settings } from './state'
import { firstPaneOf, allTabs, findById } from './tree'
import {
  createPane,
  markBusy,
  refreshPaneInfo,
  setPaneBackground,
  adjustActivePaneFontSize,
  resetActivePaneFontSize
} from './pane'
import { renderContent, updatePaneHighlight } from './content'
import { initNotifications, renderNotifications, toggleNotifPanel } from './notifications'
import { openTrackModal } from './time'
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
  setSidebarMode,
  renameSelected
} from './sidebar'
import { notebookNewNote, notebookNewFolder, notebookRenameSelected, notebookLinkFile } from './notebook'
import { openSettings } from './settings'
import {
  showFolderPicker,
  showProjectPicker,
  showCommandPalette,
  showAllMarkdown,
  showTerminalSwitcher,
  showStashManager,
  showBranchCheckout,
  showRunAppsPicker,
  showFeaturePicker
} from './pickers'
import { showImproveModal } from './improve'
import { databaseNewProject } from './database'
import { KEYBINDINGS, effectiveCombo, comboFromEvent, isRecording } from './keybindings'

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
  } else if (container?.kind === 'folder') {
    cmd = container.startup?.trim() || undefined
  }
  if (cmd) {
    // createTab pulls the container's command/startup and runs it in `path`.
    void newTab(parentFolderId, path)
    return
  }
  if (settings.projects.length && settings.askProjectOnNew) showProjectPicker(parentFolderId)
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

// ---- PTY stream wiring ----
window.crafterm.onData((id, data) => {
  const p = panes.get(id)
  if (!p) return
  p.term.write(data)
  markBusy(p)
})
// While quitting, the main process kills every PTY; ignore those exits so we
// don't tear down the tree and overwrite the saved session with an empty one.
let quitting = false
window.crafterm.onAppQuitting(() => {
  quitting = true
  persistNow() // flush the current (still-intact) tree before any pane closes
})
window.crafterm.onExit((id) => {
  if (!quitting) closePane(id)
})
// Clicking a native notification focuses the pane that fired it.
window.crafterm.onFocusPane((id) => {
  if (!panes.has(id)) return
  selectPane(id)
  // A notification click fires this while the OS is still bringing the window to
  // the front, so the terminal can lose the focus selectPane just set. Re-focus
  // once the window has settled in front.
  setTimeout(() => panes.get(id)?.term.focus(), 80)
})
// A pop-out window confirmed its close: kill the pane and drop its placeholder.
window.crafterm.onPopoutKilled((id) => killPoppedPane(id))
// Cmd+W comes from a menu accelerator so it also works while a browser pane is focused.
window.crafterm.onCloseActivePane(() => {
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

// Cmd +/- zoom: markdown doc when one is active, else sidebar (if focused),
// else the terminal font.
function activeIsDoc(): boolean {
  return !!state.activePaneId && docs.has(state.activePaneId)
}
function zoomFont(delta: number): void {
  if (activeIsDoc()) adjustDocFontSize(delta)
  else if (sidebarHasFocus()) adjustSidebarFontSize(delta)
  else adjustActivePaneFontSize(delta) // only the focused terminal, not all
}
function zoomFontReset(): void {
  if (activeIsDoc()) resetDocFontSize()
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
  'split-right': () => void splitActivePane('row'),
  'split-claude': () => void splitActivePaneWithClaude(),
  'cycle-next': () => cyclePane(1),
  'cycle-prev': () => cyclePane(-1),
  equalize: () => equalizePanes(),
  settings: () => openSettings(),
  improve: () => void showImproveModal(),
  rename: () => (isNotebookMode() ? notebookRenameSelected() : renameSelected()),
  'run-apps': () => showRunAppsPicker(),
  'new-feature': () => showFeaturePicker()
}

// ---- Shortcuts (Cmd = metaKey). Capture phase so xterm doesn't eat them. ----
window.addEventListener(
  'keydown',
  (e) => {
    if (isRecording()) return // settings is capturing a new shortcut
    if (!e.metaKey) return
    // Notebook-mode shortcuts: Cmd+N new note, Cmd+Shift+N new folder
    if (isNotebookMode() && !e.altKey && e.key.toLowerCase() === 'n') {
      if (e.shiftKey) notebookNewFolder()
      else notebookNewNote()
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

// ---- Rebuild live tree from saved state (re-spawns shells) ----
async function buildLayout(n: SavedNode): Promise<LayoutNode> {
  if (n.type === 'leaf') {
    const id = await createPane(n.cwd)
    const p = panes.get(id)
    if (p && n.titleLocked && n.title) {
      p.title = n.title
      p.titleLocked = true
      p.htitle.textContent = n.title
    }
    if (p && n.claude) {
      p.claude = true
      p.claudeSessionId = n.claudeSessionId ?? null
      // Resume the exact session if we captured its id, else the latest in this cwd.
      const cmd = n.claudeSessionId ? `claude --resume ${n.claudeSessionId}` : 'claude --continue'
      setTimeout(() => window.crafterm.input(id, cmd + '\r'), 500)
    }
    if (n.bgColor) setPaneBackground(id, n.bgColor)
    return { type: 'leaf', paneId: id }
  }
  const children: LayoutNode[] = []
  for (const c of n.children) children.push(await buildLayout(c))
  const sizes = n.sizes && n.sizes.length === children.length ? n.sizes.slice() : children.map(() => 1)
  return { type: 'split', dir: n.dir, sizes, children }
}

async function buildSidebar(nodes: SavedSidebarNode[]): Promise<SidebarNode[]> {
  const out: SidebarNode[] = []
  for (const n of nodes) {
    if (n.kind === 'tab') {
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
        id: uid('p'),
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
  const wasUpdating = await window.crafterm.deployWasUpdating()
  const updateOverlay = document.getElementById('update-overlay')
  if (wasUpdating && updateOverlay) updateOverlay.hidden = false

  const saved = await window.crafterm.loadState()
  if (saved) loadSettings(saved)

  applyBgColor()
  applyDocFont()
  applyOrientation()
  applySidebarFont()
  applySidebarCollapsed()
  initNotifications()
  wireSidebarResizer(saveSoon)

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

  const first = allTabs(state.tree)[0]
  if (first) {
    state.activeTabId = first.id
    state.activePaneId = firstPaneOf(first.root)
    renderSidebar()
    renderContent()
    if (state.activePaneId) panes.get(state.activePaneId)?.term.focus()
    saveSoon()
  } else {
    await newTab()
  }

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
